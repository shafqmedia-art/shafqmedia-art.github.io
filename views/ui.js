// الإطار العام للتطبيق + أدوات العرض المشتركة
const P = require('../lib/plans');

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// رابط آمن: بس http/https أو رابط داخلي (يمنع روابط javascript: الخبيثة)
const safeUrl = (u) => { const s = String(u ?? '').trim(); return /^(https?:\/\/|\/(?!\/))/i.test(s) ? esc(s) : '#'; };

const attr = (obj) => esc(JSON.stringify(obj ?? null));

const fmtTime = (t) => (t ? new Date(t).toLocaleString('ar-SY', { timeZone: 'Asia/Damascus', dateStyle: 'short', timeStyle: 'short' }) : '—');
const fmtDate = (t) => (t ? new Date(t).toLocaleDateString('ar-SY', { timeZone: 'Asia/Damascus' }) : '—');

const platformBadge = (p) =>
  p === 'instagram' ? '<span class="badge ig">إنستغرام</span>' : '<span class="badge fb">فيسبوك</span>';

const at = (u) => (u ? `<bdi dir="ltr">@${esc(u)}</bdi>` : '');

const ICONS = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  reply: '<path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/>',
  chat: '<path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8l-5 4V5a1 1 0 0 1 1-1z"/>',
  broadcast: '<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5"/>',
  bot: '<rect x="4" y="7" width="16" height="12" rx="3"/><circle cx="9" cy="13" r="1.5"/><circle cx="15" cy="13" r="1.5"/><path d="M12 7V3"/>',
  store: '<path d="M4 9l1.5-5h13L20 9M4 9h16v11H4zM4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.5.5 4 2.8 4 6"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  team: '<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>',
  install: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  out: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>',
  ai: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.9 2.1 2.1.9-2.1.9L19 21l-.9-2.1-2.1-.9 2.1-.9z"/>',
  content: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M8 14h3"/>',
  shield: '<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="M9 12l2 2 4-4"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  crown: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5L5 20"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
  text: '<path d="M5 6h14M5 12h14M5 18h9"/>',
  file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5"/>',
  gallery: '<rect x="2" y="6" width="14" height="13" rx="2"/><path d="M6 3h14a2 2 0 0 1 2 2v11"/>',
  food: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 2-3 5-3 8h3v10"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  headset: '<path d="M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H5a1 1 0 0 1-1-1zM20 15h-3v5h2a1 1 0 0 0 1-1z"/>',
  power: '<path d="M12 3v9M6.3 7a8 8 0 1 0 11.4 0"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
};
const icon = (n, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;

function nav(ctx) {
  const a = ctx.acc;
  const base = a ? `/a/${a.id}` : '';
  const act = ctx.active || '';
  const t = ctx.tenant;
  const lk = (f) => (f && !P.can(t, f) ? `<i class="lk">${icon('lock', 'ic sm')}</i>` : '');
  const item = (href, ic, label, key, f) => `<a href="${href}" class="${act === key ? 'on' : ''}">${icon(ic)}<span>${label}</span>${lk(f)}</a>`;
  const sub = (href, label, key) => `<a href="${href}" class="sub ${act === key ? 'on' : ''}">${label}</a>`;
  let html = '';
  if (a) {
    html += item(base, 'home', 'الصفحة الرئيسية', 'home');
    html += item(`${base}/replies`, 'reply', 'الردود التلقائية', 'replies');
    html += item(`${base}/dm`, 'chat', 'الرد على الرسائل', 'dm');
    html += item(`${base}/broadcasts`, 'broadcast', 'الحملات', 'broadcasts', 'broadcast');
    html += item(`${base}/content`, 'content', 'إدارة المحتوى', 'content', 'publish');
    html += item(`${base}/ai`, 'ai', 'شفق AI', 'ai', 'ai');
    html += item(`${base}/badwords`, 'shield', 'فلترة الكلمات', 'badwords', 'badWords');
    html += `<div class="grp ${act.startsWith('m-') ? 'open' : ''}">${item(`${base}/messenger`, 'bot', 'بوت المحادثة', 'm-x', 'messengerBot')}
      ${sub(`${base}/messenger`, 'إعدادات المحادثة', 'm-settings')}${sub(`${base}/blocks`, 'مسارات المحادثة', 'm-blocks')}</div>`;
    html += `<div class="grp ${act.startsWith('s-') ? 'open' : ''}">${item(`${base}/store`, 'store', 'متجر شفق', 's-x', 'store')}
      ${sub(`${base}/store`, 'الإعدادات', 's-settings')}${sub(`${base}/store/categories`, 'الأقسام', 's-categories')}
      ${sub(`${base}/store/products`, 'المنتجات', 's-products')}${sub(`${base}/store/orders`, 'الطلبات', 's-orders')}</div>`;
    html += item(`${base}/subscribers`, 'users', 'المتابعين', 'subscribers');
    html += item(`${base}/reports`, 'chart', 'التقارير', 'reports', 'stats');
    html += '<hr>';
  }
  html += item('/accounts', 'link', 'الحسابات المربوطة', 'accounts');
  if (t && !t.house) html += item('/billing', 'card', 'الاشتراك والباقات', 'billing');
  if (['admin', 'super'].includes(ctx.user?.role)) html += item('/team', 'team', 'فريق العمل', 'team');
  if (ctx.user?.role === 'super') html += `<hr>${item('/admin', 'crown', 'لوحة المنصة', 'admin')}`;
  html += item('/me', 'user', 'حسابي', 'me');
  html += `<a href="/install" class="${act === 'install' ? 'on' : ''}" data-install>${icon('install')}<span>تثبيت التطبيق</span></a>`;
  html += `<form method="post" action="/logout"><button class="navbtn">${icon('out')}<span>تسجيل الخروج</span></button></form>`;
  return html;
}

function accountSwitcher(ctx) {
  if (!ctx.accounts?.length) return '';
  const opts = ctx.accounts.map((a) => `<option value="${a.id}" ${ctx.acc?.id === a.id ? 'selected' : ''}>${a.platform === 'instagram' ? '◎' : 'ⓕ'} ${esc(a.username || a.name)}</option>`).join('');
  return `<select class="acc-switch" data-switch aria-label="الحساب">${ctx.acc ? '' : '<option value="">اختار حساب</option>'}${opts}</select>`;
}

const HEAD = (title) => `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#141414">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="شفق بوت">
<title>${esc(title)} · شفق بوت</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icons/icon-192.png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="stylesheet" href="/style.css?v=4">
</head>`;

// ctx: { user, acc, accounts, flash, active }
function layout(ctx, title, body) {
  return `${HEAD(title)}
<body class="app">
<header class="top">
  <button class="menu-btn" data-menu aria-label="القائمة"><span></span><span></span><span></span></button>
  <a href="/" class="brand"><img src="/logo.png" alt="شفق"><span class="brand-text"><b>شفق بوت</b><small>SHAFQ BOT</small></span></a>
  ${accountSwitcher(ctx)}
</header>
<aside class="drawer" data-drawer>
  <div class="drawer-head"><img src="/logo.png" alt=""><div><b>${esc(ctx.user?.name || ctx.user?.username || '')}</b><small>${esc(ctx.tenant?.name || '')} · <bdi dir="ltr">${esc(ctx.user?.username || '')}</bdi></small>
    ${ctx.tenant && !ctx.tenant.house ? `<a href="/billing" class="plan-chip st-${P.status(ctx.tenant)}">${esc(ctx.plan?.name || '—')} · ${P.STATUS_LABEL[P.status(ctx.tenant)]}${P.status(ctx.tenant) === 'trial' ? ` (${Math.max(0, Math.ceil((ctx.tenant.trialEndsAt - Date.now()) / 864e5))} يوم)` : ''}</a>` : ''}</div></div>
  <nav>${nav(ctx)}</nav>
</aside>
<div class="scrim" data-scrim></div>
<main>
${ctx.impersonating ? `<div class="flash warn-bar">إنت داخل على حساب الزبون <b>${esc(ctx.tenant.name)}</b>. <form method="post" action="/admin/exit" style="display:inline"><button class="btn dark sm">رجوع للوحة المنصة</button></form></div>` : ''}
${trialBanner(ctx)}
${ctx.flash ? `<div class="flash">${esc(ctx.flash)}</div>` : ''}
${body}
</main>
<div class="foot"><b>شفق ميديا</b> · كل يوم شفق جديد لعلامتك</div>
<script src="/app.js?v=5" defer></script>
</body></html>`;
}

function trialBanner(ctx) {
  const t = ctx.tenant;
  if (!t || t.house || ctx.active === 'billing') return '';
  const st = P.status(t);
  const days = (ms) => Math.max(0, Math.ceil((ms - Date.now()) / 864e5));
  if (st === 'trial' && days(t.trialEndsAt) <= 3) return `<div class="flash warn-bar">باقي ${days(t.trialEndsAt)} يوم من التجربة المجانية. <a href="/billing">اختار باقة</a></div>`;
  if (st === 'active' && t.expiresAt && days(t.expiresAt) <= 5) return `<div class="flash warn-bar">اشتراكك بيخلص بعد ${days(t.expiresAt)} يوم. <a href="/billing">جدّد هلق</a></div>`;
  return '';
}

function bare(title, body) {
  return `${HEAD(title)}<body>${body}<script src="/app.js?v=5" defer></script></body></html>`;
}

function loginPage(error, username = '') {
  return bare('دخول', `
<div class="login-wrap">
  <div class="login-card">
    <img src="/logo.png" alt="شفق">
    <h1>شفق بوت</h1>
    <p class="tagline">ردود تلقائية · متجر · رسائل جماعية</p>
    ${error ? `<div class="flash err">${esc(error)}</div>` : ''}
    <form method="post" action="/login">
      <input name="username" placeholder="اسم المستخدم" autocomplete="username" autocapitalize="none" dir="ltr" value="${esc(username)}" required autofocus>
      <input type="password" name="password" placeholder="كلمة السر" autocomplete="current-password" required>
      <button class="btn">دخول</button>
    </form>
    <p class="small">ما عندك حساب؟ <a href="/signup" class="lime">سجّل وجرّب مجاناً</a></p>
    <p class="small"><a href="/" class="muted">← الصفحة الرئيسية</a></p>
  </div>
</div>`);
}

// ---------- قطع مشتركة ----------
const pageHead = (title, actions = '', sub = '') =>
  `<div class="head-row"><div><h1>${title}</h1>${sub ? `<div class="muted">${sub}</div>` : ''}</div><div class="row">${actions}</div></div>`;

function statusField(item = {}, name = 'status') {
  const st = item.status || 'active';
  return `<label>الحالة</label>
  <div class="seg" data-seg>
    <label><input type="radio" name="${name}" value="active" ${st === 'active' ? 'checked' : ''}> شغّال</label>
    <label><input type="radio" name="${name}" value="inactive" ${st === 'inactive' ? 'checked' : ''}> موقّف</label>
    <label><input type="radio" name="${name}" value="scheduled" ${st === 'scheduled' ? 'checked' : ''}> بفترة محددة</label>
  </div>
  <div class="grid2 when-scheduled" data-show-when="${name}=scheduled">
    <div><label>من</label><input type="datetime-local" name="from" value="${esc(item.from || '')}"></div>
    <div><label>لـ</label><input type="datetime-local" name="to" value="${esc(item.to || '')}"></div>
  </div>`;
}

const statusTag = (item) => {
  const st = item.status || 'active';
  return st === 'active' ? '<span class="tag ok">شغّال</span>' : st === 'scheduled' ? '<span class="tag warn">بفترة محددة</span>' : '<span class="tag">موقّف</span>';
};

// منتقي صورة: input مخفي + معاينة + زر رفع
const imagePicker = (name, value, label = 'الصورة') => `
  <label>${label}</label>
  <div class="img-pick" data-img-pick>
    <input type="hidden" name="${name}" value="${esc(value || '')}">
    <div class="img-prev">${value ? `<img src="${esc(value)}" alt="">` : '<span>＋</span>'}</div>
    <div class="row"><button type="button" class="btn ghost sm" data-upload>رفع</button><button type="button" class="btn ghost sm" data-clear>إزالة</button></div>
  </div>`;

// رسم بياني لآخر 14 يوم (SVG)
function chart(days) {
  const series = [
    ['text', 'رسائل وصلت', '#141414'],
    ['auto', 'ردود تلقائية', '#8CCB1E'],
    ['clicks', 'ضغطات أزرار', '#F5A623'],
    ['blocks', 'رسائل انبعتت', '#A3A39C'],
  ];
  const W = 640; const H = 220; const P = 28;
  const max = Math.max(1, ...days.flatMap((d) => series.map(([k]) => d[k] || 0)));
  const x = (i) => P + (i * (W - P * 2)) / Math.max(1, days.length - 1);
  const y = (v) => H - P - (v / max) * (H - P * 2);
  const grid = [0, 0.5, 1].map((f) => `<line x1="${P}" x2="${W - P}" y1="${y(max * f)}" y2="${y(max * f)}" class="gl"/><text x="${P - 6}" y="${y(max * f) + 4}" class="gt" text-anchor="end">${Math.round(max * f)}</text>`).join('');
  const lines = series.map(([k, , c]) => `<polyline fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round" points="${days.map((d, i) => `${x(i)},${y(d[k] || 0)}`).join(' ')}"/>`).join('');
  const labels = days.map((d, i) => (i % 2 === 0 ? `<text x="${x(i)}" y="${H - 8}" class="gt" text-anchor="middle">${d.day.slice(5).replace('-', '/')}</text>` : '')).join('');
  const legend = series.map(([k, l, c]) => `<span><i style="background:${c}"></i>${l} <b>${days.reduce((n, d) => n + (d[k] || 0), 0)}</b></span>`).join('');
  return `<div class="chart"><div class="legend">${legend}</div><svg viewBox="0 0 ${W} ${H}" dir="ltr" preserveAspectRatio="none">${grid}${lines}${labels}</svg></div>`;
}

const empty = (text, action = '') => `<div class="card center empty"><p class="muted">${text}</p>${action}</div>`;

module.exports = {
  esc, safeUrl, attr, fmtTime, fmtDate, platformBadge, at, icon, layout, bare, loginPage, pageHead,
  statusField, statusTag, imagePicker, chart, empty,
};
