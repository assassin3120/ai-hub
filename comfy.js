// 絵コンテの「清書」：このMacの ComfyUI に、棒人間などのラフと LoRA（Ryo の画風）を渡して描き直してもらう。
// 絵は外に出ない。ComfyUI が起きていなければ、ここで起動する。
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const CONF = {
  dir: path.join(HOME, 'ComfyUI'),
  python: '/opt/homebrew/Caskroom/miniforge/base/envs/comfy/bin/python',
  url: 'http://127.0.0.1:8188',
  checkpoint: 'sd_xl_base_1.0.safetensors',
  vae: 'sdxl_vae.safetensors',
  controlnet: 'controlnet-scribble-sdxl-1.0.safetensors',
  lora: 'ryo_conte.safetensors',
};

const STYLE = 'ryoconte style, monochrome storyboard sketch, thin black pen line drawing on white paper, simple loose linework, no shading';
const NEGATIVE = 'color, colored, photo, photorealistic, 3d render, gray shading, heavy shadows, gradient, text, letters, watermark, signature, frame border, blurry, lowres';
// 画面比ごとの生成サイズ（学習は 1024×576）
const SIZES = { '16:9': [1024, 576], '9:16': [576, 1024], '4:3': [1024, 768], '1:1': [896, 896], '2.39:1': [1216, 512] };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = async () => { try { return (await fetch(`${CONF.url}/system_stats`)).ok; } catch { return false; } };

let starting = null;
async function ensureServer() {
  if (await alive()) return;
  if (!starting) {
    starting = (async () => {
      if (!fs.existsSync(CONF.python) || !fs.existsSync(path.join(CONF.dir, 'main.py'))) throw new Error('ComfyUI が見つかりません（~/ComfyUI）');
      const log = fs.openSync(path.join(os.tmpdir(), 'ai-hub-comfyui.log'), 'a');
      spawn(CONF.python, ['main.py', '--listen', '127.0.0.1', '--port', '8188'], { cwd: CONF.dir, detached: true, stdio: ['ignore', log, log] }).unref();
      for (let i = 0; i < 90; i++) { if (await alive()) return; await sleep(2000); }
      throw new Error('ComfyUI が起動しませんでした');
    })().finally(() => { starting = null; });
  }
  await starting;
}

const available = () => fs.existsSync(path.join(CONF.dir, 'models', 'loras', CONF.lora));

async function upload(file) {
  const form = new FormData();
  form.append('image', new Blob([fs.readFileSync(file)]), `sketch_${Date.now()}${path.extname(file) || '.png'}`);
  form.append('overwrite', 'true');
  const r = await fetch(`${CONF.url}/upload/image`, { method: 'POST', body: form });
  if (!r.ok) throw new Error('ラフを ComfyUI に渡せませんでした');
  return (await r.json()).name;
}

function workflow({ image, prompt, aspect, seed, strength = 0.85, loraWeight = 0.9 }) {
  const [w, h] = SIZES[aspect] ?? SIZES['16:9'];
  return {
    1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: CONF.checkpoint } },
    2: { class_type: 'LoraLoader', inputs: { model: ['1', 0], clip: ['1', 1], lora_name: CONF.lora, strength_model: loraWeight, strength_clip: loraWeight } },
    3: { class_type: 'VAELoader', inputs: { vae_name: CONF.vae } },
    4: { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 1], text: prompt ? `${STYLE}, ${prompt}` : STYLE } },
    5: { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 1], text: NEGATIVE } },
    6: { class_type: 'LoadImage', inputs: { image } },
    // ラフは白地に黒い線。Scribble ControlNet は黒地に白い線で覚えているので反転して渡す
    7: { class_type: 'ImageInvert', inputs: { image: ['6', 0] } },
    8: { class_type: 'ImageScale', inputs: { image: ['7', 0], upscale_method: 'area', width: w, height: h, crop: 'center' } },
    9: { class_type: 'ControlNetLoader', inputs: { control_net_name: CONF.controlnet } },
    10: { class_type: 'ControlNetApplyAdvanced', inputs: { positive: ['4', 0], negative: ['5', 0], control_net: ['9', 0], image: ['8', 0], strength, start_percent: 0, end_percent: 0.9, vae: ['3', 0] } },
    11: { class_type: 'EmptyLatentImage', inputs: { width: w, height: h, batch_size: 1 } },
    12: { class_type: 'KSampler', inputs: { model: ['2', 0], positive: ['10', 0], negative: ['10', 1], latent_image: ['11', 0], seed, steps: 26, cfg: 6, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 1 } },
    13: { class_type: 'VAEDecode', inputs: { samples: ['12', 0], vae: ['3', 0] } },
    14: { class_type: 'SaveImage', inputs: { images: ['13', 0], filename_prefix: 'storyboard_cleanup' } },
  };
}

// ラフ（ファイル）を清書して、PNG のバイト列を返す
async function cleanup(sketchFile, { prompt = '', aspect = '16:9', seed } = {}) {
  if (!available()) throw new Error(`画風の LoRA（${CONF.lora}）がまだありません`);
  await ensureServer();
  const image = await upload(sketchFile);
  const wf = workflow({ image, prompt, aspect, seed: seed ?? Math.floor(Math.random() * 1e9) });
  const r = await fetch(`${CONF.url}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: wf }) });
  const j = await r.json();
  if (!r.ok || !j.prompt_id) throw new Error(`ComfyUI に頼めませんでした：${JSON.stringify(j.node_errors || j.error || j).slice(0, 300)}`);
  for (let i = 0; i < 600; i++) {
    await sleep(2000);
    const h = (await (await fetch(`${CONF.url}/history/${j.prompt_id}`)).json())[j.prompt_id];
    if (!h) continue;
    if (h.status?.status_str === 'error') throw new Error('ComfyUI で描き直しに失敗しました');
    const img = h.outputs?.['14']?.images?.[0];
    if (img) {
      const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type });
      return Buffer.from(await (await fetch(`${CONF.url}/view?${q}`)).arrayBuffer());
    }
  }
  throw new Error('描き直しが時間内に終わりませんでした');
}

module.exports = { cleanup, available, CONF };
