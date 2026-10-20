// 請求書の計算と、画面のプレビュー・PDF に共通で使う HTML を作る。
// 画面（<script>）と main.js（require）の両方から読み込む。
(function (root) {
  const yen = (n) => `¥${Math.round(n).toLocaleString('ja-JP')}`;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // 源泉徴収税額（報酬・料金。100万円まで10.21%、超える部分は20.42%）
  const withholding = (base) => (base <= 1e6 ? Math.floor(base * 0.1021) : Math.floor(102100 + (base - 1e6) * 0.2042));

  // 適格請求書のルールどおり、消費税は税率ごとに合計してから1回だけ端数を切り捨てる
  function calc(inv) {
    const items = (inv.items || []).filter((it) => it.name || it.price);
    const byRate = {};
    for (const it of items) {
      const amount = (Number(it.qty) || 0) * (Number(it.price) || 0);
      const rate = Number(it.rate ?? 10);
      byRate[rate] = (byRate[rate] || 0) + amount;
    }
    const rates = Object.keys(byRate).map(Number).sort((a, b) => b - a)
      .map((rate) => ({ rate, base: byRate[rate], tax: Math.floor(byRate[rate] * rate / 100) }));
    const subtotal = rates.reduce((s, r) => s + r.base, 0);
    const tax = rates.reduce((s, r) => s + r.tax, 0);
    const total = subtotal + tax;
    const wh = inv.withholding ? withholding(subtotal) : 0;
    return { items, rates, subtotal, tax, total, wh, due: total - wh };
  }

  function invoiceHtml(inv, issuer = {}) {
    const c = calc(inv);
    const lines = (s) => esc(s).replace(/\n/g, '<br>');
    return `<div class="inv">
  <div class="inv-head"><h1>請求書</h1><div class="inv-meta">
    <div>請求番号　${esc(inv.number)}</div><div>請求日　${esc(inv.date)}</div></div></div>
  <div class="inv-parties">
    <div class="inv-to"><div class="inv-client">${esc(inv.client)} ${esc(inv.honorific || '御中')}</div>
      ${inv.subject ? `<div class="inv-subject">件名：${esc(inv.subject)}</div>` : ''}
      <p>下記のとおりご請求申し上げます。</p>
      <div class="inv-total"><span>ご請求金額</span><b>${yen(c.due)}</b><small>${c.wh ? "（税込・源泉徴収後）" : "（税込）"}</small></div>
      ${inv.dueDate ? `<div>お支払期限　${esc(inv.dueDate)}</div>` : ''}</div>
    <div class="inv-from"><div class="inv-issuer">${esc(issuer.name)}</div>
      <div>${lines(issuer.address)}</div>
      ${issuer.contact ? `<div>${lines(issuer.contact)}</div>` : ''}
      ${issuer.regNo ? `<div>登録番号　${esc(issuer.regNo)}</div>` : ''}</div>
  </div>
  <table class="inv-items"><thead><tr><th>品目</th><th class="n">数量</th><th class="n">単価</th><th class="n">税率</th><th class="n">金額（税抜）</th></tr></thead>
  <tbody>${c.items.map((it) => `<tr><td>${esc(it.name)}</td><td class="n">${esc(it.qty)}${esc(it.unit || '')}</td><td class="n">${yen(Number(it.price) || 0)}</td><td class="n">${esc(it.rate ?? 10)}%${Number(it.rate) === 8 ? '※' : ''}</td><td class="n">${yen((Number(it.qty) || 0) * (Number(it.price) || 0))}</td></tr>`).join('')}</tbody></table>
  <table class="inv-sum"><tbody>
    <tr><th>小計（税抜）</th><td>${yen(c.subtotal)}</td></tr>
    ${c.rates.map((r) => `<tr><th>${r.rate}%対象 ${yen(r.base)} の消費税</th><td>${yen(r.tax)}</td></tr>`).join('')}
    <tr class="strong"><th>合計（税込）</th><td>${yen(c.total)}</td></tr>
    ${c.wh ? `<tr><th>源泉徴収税額</th><td>−${yen(c.wh)}</td></tr><tr class="strong"><th>差引ご請求額</th><td>${yen(c.due)}</td></tr>` : ''}
  </tbody></table>
  ${c.rates.some((r) => r.rate === 8) ? '<p class="inv-note">※は軽減税率（8%）対象です。</p>' : ''}
  ${issuer.bank ? `<div class="inv-box"><b>お振込先</b><div>${lines(issuer.bank)}</div><small>振込手数料はご負担くださいますようお願いいたします。</small></div>` : ''}
  ${inv.note ? `<div class="inv-box"><b>備考</b><div>${lines(inv.note)}</div></div>` : ''}
</div>`;
  }

  const INVOICE_CSS = `
.inv{font-family:"Hiragino Sans","Yu Gothic",sans-serif;color:#222;font-size:12px;line-height:1.6;padding:40px 44px;background:#fff}
.inv h1{font-size:26px;letter-spacing:.6em;margin:0}
.inv-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #222;padding-bottom:10px}
.inv-meta{text-align:right}
.inv-parties{display:flex;justify-content:space-between;gap:24px;margin:22px 0}
.inv-client{font-size:17px;border-bottom:1px solid #222;padding-bottom:4px;margin-bottom:6px}
.inv-subject{margin-bottom:4px}
.inv-total{display:flex;align-items:baseline;gap:12px;border-bottom:3px double #222;padding:6px 0;margin:10px 0}
.inv-total b{font-size:22px}
.inv-from{text-align:right;min-width:220px}
.inv-issuer{font-size:15px;font-weight:700}
.inv-items,.inv-sum{width:100%;border-collapse:collapse}
.inv-items th{background:#f1f1f1;font-weight:600}
.inv-items th,.inv-items td{border:1px solid #bbb;padding:6px 8px;text-align:left}
.inv .n{text-align:right;white-space:nowrap}
.inv-sum{width:55%;margin:12px 0 0 auto}
.inv-sum th,.inv-sum td{padding:5px 8px;border-bottom:1px solid #ddd;text-align:right;font-weight:400}
.inv-sum th{color:#555}
.inv-sum .strong th,.inv-sum .strong td{font-weight:700;color:#222;border-bottom:1px solid #222}
.inv-note{font-size:11px;color:#555}
.inv-box{border:1px solid #bbb;padding:8px 12px;margin-top:16px}
.inv-box b{display:block;margin-bottom:2px}`;

  const api = { calc, invoiceHtml, withholding, INVOICE_CSS };
  if (typeof module !== 'undefined') module.exports = api;
  else root.invoiceDoc = api;
}(this));
