// الموقع العام: الصفحة التعريفية، جدول الباقات، التسجيل
const { esc, icon } = require('./ui');
const P = require('../lib/plans');

const HEAD = (title) => `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#141414">
<meta name="description" content="شفق بوت من شفق ميديا: صفحتك بترد وبتبيع وبتنشر لحالها — ردود تلقائية، محادثات بأزرار، متجر بالرسائل، حملات، وأدوات ذكاء اصطناعي لفيسبوك وإنستغرام.">
<title>${esc(title)}</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icons/icon-192.png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="stylesheet" href="/style.css?v=4">
</head>`;

const topbar = (user) => `
<header class="pub-top">
  <a href="/" class="brand"><img src="/logo.png" alt="شفق"><span class="brand-text"><b>شفق بوت</b><small>SHAFQ BOT</small></span></a>
  <nav><a href="/#features">المزايا</a><a href="/pricing">الباقات</a>${user ? '<a href="/" class="btn sm">لوحة التحكم</a>' : '<a href="/login">دخول</a><a href="/signup" class="btn sm">جرّب مجاناً</a>'}</nav>
</header>`;

const footer = (s) => `
<footer class="pub-foot">
  <img src="/logo.png" alt="">
  <p><b>شفق ميديا</b> · وين ما كنت، منجي لعندك</p>
  <p class="muted small">${s.supportWhatsapp ? `واتساب <bdi dir="ltr">${esc(s.supportWhatsapp)}</bdi> · ` : ''}shafqmedia@gmail.com · @shafq.media</p>
  <p class="muted small"><a href="/privacy">سياسة الخصوصية</a> · <a href="/data-deletion">حذف البيانات</a></p>
  <p class="muted small">المزايا وحدود الاستخدام بتختلف حسب الباقة وصلاحيات الحسابات المربوطة. أدوات المراسلة بتخضع لسياسات Meta.</p>
</footer>`;

const fmt = (n) => Number(n).toLocaleString('en-US');

function cell(plan, f) {
  const on = Boolean(plan.features?.[f.key]);
  if (f.type === 'bool') return on ? '<span class="yes">✓</span>' : '<span class="no">✕</span>';
  if (f.type === 'credits') return on && Number(plan.aiCredits) ? `<span class="val" dir="ltr">${fmt(plan.aiCredits)} رصيد</span>` : '<span class="no">✕</span>';
  if (f.key === 'stats') return on ? `<span class="val">${plan.statsDetailed ? f.onMax : f.on}</span>` : '<span class="no">✕</span>';
  return `<span class="val">${on ? f.on : f.off}</span>`;
}

// جدول الباقات: المزايا فوق، والأسعار تحت
function plansTable(plans, s, { cta = (p) => `<a class="btn sm" href="/signup?plan=${p.id}">ابدأ</a>`, current = '' } = {}) {
  let lastGroup = '';
  const rows = P.FEATURES.map((f) => {
    let g = '';
    if (f.group && f.group !== lastGroup) { lastGroup = f.group; g = `<tr class="grp-row"><td colspan="${plans.length + 1}">${f.group}</td></tr>`; }
    return `${g}<tr><th scope="row">${f.label}</th>${plans.map((p) => `<td>${cell(p, f)}</td>`).join('')}</tr>`;
  }).join('');
  const pageRow = `<tr><th scope="row">عدد الصفحات</th>${plans.map((p) => `<td><span class="val">${p.pages || 1}</span></td>`).join('')}</tr>`;

  const anyPrice = plans.some((p) => Object.values(p.prices || {}).some((x) => Object.values(x || {}).some((v) => Number(v) > 0)));
  const priceRows = Object.entries(P.PERIODS).map(([per, label]) => Object.entries(P.PLATFORMS).map(([pl, plLabel], i) => `
    <tr>${i === 0 ? `<th rowspan="2" class="per">${label}</th>` : ''}<th class="pl">${plLabel}</th>${plans.map((p) => {
      const v = P.price(p, pl, per);
      return `<td><b dir="ltr">${v ? `${fmt(v)}` : '—'}</b></td>`;
    }).join('')}</tr>`).join('')).join('');

  return `
<div class="plans-wrap">
  <div class="plans-head">${plans.map((p) => `<div class="plan-card ${p.highlight ? 'hl' : ''} ${current === p.id ? 'cur' : ''}">
    ${p.highlight ? '<span class="ribbon">ننصح فيها</span>' : ''}<h3>${esc(p.name)}</h3><p>${esc(p.tagline || '')}</p>${cta(p)}</div>`).join('')}</div>
  <div class="table-wrap plans-table"><table>
    <thead><tr><th>شو فيها</th>${plans.map((p) => `<th class="${p.highlight ? 'hl' : ''}">${esc(p.name)}</th>`).join('')}</tr></thead>
    <tbody>${rows}${pageRow}</tbody>
  </table></div>
  ${s.bonusSecondPage ? '<p class="note-line">هدية: اشترك ببرو أو ماكس لـ 3 أشهر وأكتر، وخود <b>صفحة إضافية</b> عليها.</p>' : ''}
  <h3 class="prices-title">الأسعار ${s.currency ? `<span class="muted small">(${esc(s.currency)})</span>` : ''}</h3>
  <div class="table-wrap plans-table prices"><table>
    <thead><tr><th colspan="2">المدة</th>${plans.map((p) => `<th class="${p.highlight ? 'hl' : ''}">${esc(p.name)}</th>`).join('')}</tr></thead>
    <tbody>${priceRows}</tbody>
  </table></div>
  ${anyPrice ? '' : `<p class="note-line">الأسعار قريباً — ${s.supportWhatsapp ? `راسلنا على واتساب <bdi dir="ltr">${esc(s.supportWhatsapp)}</bdi>` : 'راسلنا'} ومنقلّك شو بيناسبك.</p>`}
</div>`;
}

const FEATURE_SECTIONS = [
  ['reply', 'ردود ما بتنام', 'كل تعليق ورسالة إلهم رد بثواني — علني تحت التعليق، وتفاصيل كاملة بالخاص، بصيغ متنوعة وبلهجتك.'],
  ['bot', 'محادثة بتوصل للبيع', 'مسارات بأزرار بتاخد الزبون من "شو عندكن؟" لحد "بدي احجز" — بدون ما تفتح الموبايل.'],
  ['store', 'متجرك جوّا الرسائل', 'أقسام ومنتجات وسلة وطلبات، كلها جوّا المحادثة، والطلب بيوصلك عاللوحة.'],
  ['ai', 'شفق AI', 'كابشنات ومنشورات، صيغ ردود، تصاميم، ومساعد بيجاوب الزباين من معلومات صفحتك.'],
  ['content', 'نشر وجدولة', 'منشورات وصور وريلز لفيسبوك وإنستغرام، من مكان واحد وبالوقت اللي بتختاره.'],
  ['stats', 'أرقام واضحة', 'نشاط كل يوم، تفاعل كل منشور، مبيعات المتجر، وتنبيه إذا صار أي خلل.'],
];

function landingPage({ plans, settings: s }) {
  return `${HEAD('شفق بوت · إدارة صفحاتك صارت أسهل')}
<body class="pub">
${topbar()}
<section class="hero">
  <div class="hero-in">
    <span class="kicker">SHAFQ BOT</span>
    <h1>صفحتك بترد وبتبيع<br><mark>وإنت مرتاح</mark></h1>
    <p>شفق بوت بيرد على تعليقات ورسائل فيسبوك وإنستغرام، بياخد الطلبات، وبينشر عنك — من تطبيق واحد على موبايلك.</p>
    <div class="row hero-cta"><a class="btn" href="/signup">ابدأ تجربة مجانية ${s.trialDays ? `${s.trialDays} أيام` : ''}</a><a class="btn ghost-light" href="/pricing">شوف الباقات</a></div>
    <div class="hero-icons" aria-hidden="true"><span>${icon('chat')}</span><span>${icon('bot')}</span><span>${icon('store')}</span><span>${icon('calendar')}</span><span>${icon('ai')}</span></div>
  </div>
</section>
<main class="pub-main">
  <section id="features">
    <div class="sec-head"><h2>شو بيعمل <mark>شفق بوت</mark>؟</h2><p class="muted">كل اللي بتحتاجه لتخلّي صفحتك شغّالة 24 ساعة</p></div>
    <div class="feat-grid">${FEATURE_SECTIONS.map(([ic, t, d]) => `<div class="feat"><span class="feat-ic">${icon(ic)}</span><h3>${t}</h3><p>${d}</p></div>`).join('')}</div>
  </section>
  <section>
    <div class="sec-head"><h2>3 خطوات وبتبلّش</h2></div>
    <div class="steps-grid">
      <div><b>1</b><h3>سجّل</h3><p>اسم مستخدم وكلمة سر، وبتبلّش تجربتك المجانية فوراً.</p></div>
      <div><b>2</b><h3>اربط</h3><p>فوت بفيسبوك واختار صفحتك وحساب الإنستغرام تبعها.</p></div>
      <div><b>3</b><h3>شغّل</h3><p>اكتب ردودك أو خلّي شفق AI يكتبها، والبوت بيكمّل عنك.</p></div>
    </div>
  </section>
  <section id="plans">
    <div class="sec-head"><h2>اختار <mark>باقتك</mark></h2><p class="muted">ابدأ بالتجربة، وغيّر الباقة وقت ما بدك</p></div>
    ${plansTable(plans, s)}
  </section>
  <section class="cta-box">
    <h2>خلّي شفق بوت يشتغل عنك</h2>
    <p>التجربة مجانية وما بدها بطاقة.</p>
    <a class="btn dark" href="/signup">سجّل هلق</a>
  </section>
</main>
${footer(s)}
<script src="/app.js?v=5" defer></script>
</body></html>`;
}

function pricingPage({ plans, settings: s, user }) {
  return `${HEAD('الباقات · شفق بوت')}
<body class="pub">
${topbar(user)}
<main class="pub-main">
  <div class="sec-head"><h1>باقات <mark>شفق بوت</mark></h1><p class="muted">كل حساب جديد بيبلّش بتجربة مجانية</p></div>
  ${plansTable(plans, s, { cta: (p) => (user ? `<a class="btn sm" href="/billing?plan=${p.id}">اشترك</a>` : `<a class="btn sm" href="/signup?plan=${p.id}">ابدأ</a>`) })}
</main>
${footer(s)}
</body></html>`;
}

function signupPage({ settings: s, error = '', values = {}, closed = false }) {
  return `${HEAD('إنشاء حساب · شفق بوت')}
<body>
<div class="login-wrap">
  <div class="login-card wide">
    <a href="/"><img src="/logo.png" alt="شفق"></a>
    <h1>إنشاء حساب</h1>
    ${closed ? `<p class="tagline">التسجيل مسكّر حالياً.</p><p>${s.supportWhatsapp ? `تواصل معنا على واتساب <bdi dir="ltr">${esc(s.supportWhatsapp)}</bdi>` : ''}</p>` : `
    <p class="tagline">${s.trialDays} أيام تجربة مجانية — بدون أي دفع</p>
    ${error ? `<div class="flash err">${esc(error)}</div>` : ''}
    <form method="post" action="/signup">
      <input name="name" placeholder="اسمك" value="${esc(values.name)}" required>
      <input name="business" placeholder="اسم الصفحة أو النشاط" value="${esc(values.business)}" required>
      <input name="phone" placeholder="رقم الواتساب (مع مفتاح البلد)" dir="ltr" inputmode="tel" value="${esc(values.phone)}" required>
      <input name="username" placeholder="اسم المستخدم (إنكليزي)" dir="ltr" autocapitalize="none" autocomplete="username" value="${esc(values.username)}" required>
      <input type="password" name="password" placeholder="كلمة السر (8 أحرف على الأقل)" autocomplete="new-password" minlength="8" required>
      <input type="password" name="password2" placeholder="أعد كتابة كلمة السر" autocomplete="new-password" minlength="8" required>
      <button class="btn">إنشاء الحساب</button>
    </form>
    <p class="small">عندك حساب؟ <a href="/login" class="lime">دخول</a></p>
    <p class="small muted">بالتسجيل إنت موافق على <a href="/privacy">سياسة الخصوصية</a>.</p>`}
  </div>
</div>
</body></html>`;
}

module.exports = { landingPage, pricingPage, signupPage, plansTable };
