// الصفحات العامة: الحسابات، الرئيسية، المستخدمين، التقارير، الفريق، حسابي، التثبيت
const { esc, fmtTime, fmtDate, platformBadge, at, layout, bare, pageHead, chart, empty, icon } = require('./ui');

function accountsPage(ctx, { configured, limit }) {
  const rows = ctx.accounts.map((a) => `
  <div class="acc">
    <a href="/a/${a.id}" class="acc-main">
      <div class="acc-name">${esc(a.name)} ${a.username ? `<span class="muted">${at(a.username)}</span>` : ''}</div>
      <div class="muted small">${a.rules.length} رد تلقائي · ${a.store?.enabled ? 'المتجر مفعّل' : 'بدون متجر'}</div>
    </a>
    <div class="row">${platformBadge(a.platform)}
      <form method="post" action="/accounts/${a.id}/toggle"><button class="switch ${a.enabled ? 'on' : ''}" title="${a.enabled ? 'البوت شغّال' : 'البوت موقّف'}"><i></i></button></form>
    </div>
  </div>`).join('');

  return layout({ ...ctx, active: 'accounts' }, 'الحسابات', `
${pageHead('الحسابات المربوطة', configured ? '<a class="btn" href="/connect">+ ربط حساب</a>' : '', ctx.tenant?.house ? '' : `الصفحات: ${new Set(ctx.accounts.map((a) => a.pageId)).size} من ${limit} حسب باقتك`)}
${configured ? '' : '<div class="flash err">لسا ما حطيت META_APP_ID و META_APP_SECRET و BASE_URL بإعدادات السيرفر. شوف ملف README.</div>'}
${ctx.accounts.length ? `<div class="list">${rows}</div>` : empty('ما في حسابات لسا. اكبس "ربط حساب"، فوت بحساب فيسبوك اللي عنده صلاحية على الصفحات، واختار الصفحات وحسابات الإنستغرام.')}
<div class="card">
  <h2>قبل ما تربط</h2>
  <ol class="steps">
    <li>لازم تكون أدمن على صفحة الفيسبوك.</li>
    <li>حساب الإنستغرام لازم يكون احترافي ومربوط بنفس الصفحة.</li>
    <li>بعد تسجيل الدخول وافق على كل الصلاحيات اللي بيطلبها شفق بوت، وبعدين اختار شو بدك تضيف.</li>
  </ol>
</div>`);
}

function pickPages(ctx, pages) {
  const items = pages.map((p) => {
    const ig = p.instagram_business_account;
    return `
    <div class="card">
      <label class="check"><input type="checkbox" name="pick" value="fb:${esc(p.id)}" checked> ${platformBadge('facebook')} <b>${esc(p.name)}</b></label>
      ${ig ? `<label class="check"><input type="checkbox" name="pick" value="ig:${esc(p.id)}" checked> ${platformBadge('instagram')} <b>${at(ig.username || ig.name || ig.id)}</b> <span class="muted small">مربوط بـ ${esc(p.name)}</span></label>`
        : '<div class="muted small">ما في حساب إنستغرام احترافي مربوط بهالصفحة</div>'}
    </div>`;
  }).join('');
  return layout({ ...ctx, active: 'accounts' }, 'اختيار الحسابات', `
${pageHead('اختار شو بدك تضيف')}
${pages.length ? `<form method="post" action="/connect/save">${items}<button class="btn">إضافة المحدد</button></form>`
    : '<div class="card">ما لقينا ولا صفحة. تأكد إنك أدمن عالصفحة وإنك وافقت على كل الصلاحيات.</div>'}`);
}

function homePage(ctx, { counts, days }) {
  const a = ctx.acc;
  const base = `/a/${a.id}`;
  const today = days[days.length - 1] || {};
  const stat = (label, n, href) => `<a class="kpi" href="${href}"><small>${label}</small><b>${n}</b></a>`;
  return layout({ ...ctx, active: 'home' }, a.name, `
<div class="head-row">
  <div><h1>${esc(a.name)}</h1><div class="row">${platformBadge(a.platform)} ${a.username ? `<span class="muted">${at(a.username)}</span>` : ''}</div></div>
  <form method="post" action="/accounts/${a.id}/toggle?back=${base}"><button class="btn ${a.enabled ? 'ghost' : 'dark'}">${a.enabled ? 'إيقاف البوت' : 'تشغيل البوت'}</button></form>
</div>
<section class="today">
  <div class="today-head"><b>نشاط اليوم</b><span class="dot ${a.enabled ? 'on' : 'off'}"></span><span class="muted small">${a.enabled ? 'البوت شغّال' : 'البوت موقّف'}</span></div>
  <div class="today-nums">
    <div><b>${today.text || 0}</b><small>رسالة وصلت</small></div>
    <div><b>${today.auto || 0}</b><small>رد تلقائي</small></div>
    <div><b>${today.clicks || 0}</b><small>ضغطة زر</small></div>
  </div>
</section>
<div class="kpis">
  ${stat('الردود التلقائية', counts.rules, `${base}/replies`)}${stat('المتابعين', counts.subscribers, `${base}/subscribers`)}
  ${stat('مسارات المحادثة', counts.blocks, `${base}/blocks`)}${stat('الطلبات', counts.orders, `${base}/store/orders`)}
</div>
<div class="quick">
  <a href="${base}/replies/new">${icon('reply')}<span>رد تلقائي جديد</span></a>
  <a href="${base}/broadcasts/new">${icon('broadcast')}<span>حملة جديدة</span></a>
  <a href="${base}/content/new">${icon('content')}<span>منشور جديد</span></a>
  <a href="${base}/ai">${icon('ai')}<span>اكتب بالذكاء</span></a>
</div>
<section class="card"><h2>نشاط آخر 14 يوم</h2>${chart(days)}</section>
<details class="card"><summary class="bad-text"><b>حذف الحساب من البوت</b></summary>
  <p class="muted small">رح ينحذف الحساب مع ردوده ومتجره ووحداته ومشتركينه من شفق بوت (ما بيتأثر شي على فيسبوك أو إنستغرام).</p>
  <form method="post" action="${base}/delete" data-confirm="رح ينحذف الحساب وكل بياناته من البوت. متأكد؟"><button class="btn danger-btn">حذف ${esc(a.name)}</button></form>
</details>`);
}

function subscribersPage(ctx, subs, q) {
  const rows = subs.map((s) => `<tr><td><b>${esc(s.name || '—')}</b><div class="muted small" dir="ltr">${esc(s.psid)}</div></td>
    <td>${fmtTime(s.lastMessageAt || s.lastAt)}</td><td>${fmtDate(s.firstAt)}</td><td>${(s.posts || []).length}</td></tr>`).join('');
  return layout({ ...ctx, active: 'subscribers' }, 'المتابعين', `
${pageHead('المتابعين', '', `${subs.length} شخص تواصل مع الحساب`)}
<form class="search" method="get"><input name="q" value="${esc(q)}" placeholder="بحث بالاسم..."></form>
${subs.length ? `<div class="table-wrap"><table><thead><tr><th>الاسم</th><th>آخر تواصل</th><th>أول مرة</th><th>منشورات</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : empty('لسا ما حدا تواصل. كل شخص بيراسل أو بيكبس زر بينضاف هون لحاله.')}`);
}

const resultLabel = {
  replied: '<span class="tag ok">انبعت رد</span>', welcome: '<span class="tag ok">ترحيب</span>', default: '<span class="tag ok">رد افتراضي</span>',
  store: '<span class="tag ok">المتجر</span>', order: '<span class="tag ok">طلب</span>', 'no-match': '<span class="tag">ما في رد مطابق</span>',
  ai: '<span class="tag ok">المساعد الذكي</span>', filtered: '<span class="tag warn">انفلتر</span>',
  skipped: '<span class="tag warn">تجاوز</span>', error: '<span class="tag bad">خطأ</span>',
};
const kindLabel = { dm: 'دايركت', comment: 'تعليق', click: 'زر', story: 'ستوري', order: 'طلب', post: 'منشور' };

function logRows(logs, accountsById) {
  if (!logs.length) return '<p class="muted">لسا ما في شي.</p>';
  return `<div class="logs">${logs.map((l) => `
    <div class="log">
      <div class="row between"><span>${kindLabel[l.kind] || esc(l.kind)} ${accountsById ? `· ${esc(accountsById[l.accountId]?.name || '؟')}` : ''}</span><span class="muted small">${fmtTime(l.at)}</span></div>
      <div>${esc(l.text)}</div>
      <div class="row">${resultLabel[l.result] || esc(l.result)} ${l.rule ? `<span class="muted small">(${esc(l.rule)})</span>` : ''}
      ${l.error ? `<span class="small bad-text">${esc(l.error)}</span>` : ''}</div>
    </div>`).join('')}</div>`;
}

function reportsPage(ctx, { days, logs, totals, perPost, detailed, canExport, store }) {
  const box = (label, n) => `<div class="kpi"><small>${label}</small><b>${n}</b></div>`;
  const base = `/a/${ctx.acc.id}/reports`;
  const incidents = logs.filter((l) => l.result === 'error');
  const lock = (f) => `<a href="/billing?upgrade=${f}" class="lock">${icon('lock', 'ic sm')} ترقية</a>`;
  return layout({ ...ctx, active: 'reports' }, 'التقارير', `
${pageHead('التقارير', canExport ? `<a class="btn ghost sm" href="${base}/export.csv">تصدير النشاط</a><a class="btn ghost sm" href="${base}/export.csv?type=orders">تصدير الطلبات</a>` : `<span class="muted small">تصدير التقارير ${lock('detailedReports')}</span>`)}
<div class="kpis">${box('ردود تلقائية', totals.auto)}${box('رسائل وصلت', totals.text)}${box('ضغطات أزرار', totals.clicks)}${box('رسائل انبعتت', totals.blocks)}
${store ? `${box('طلبات المتجر', store.orders)}${box('مبيعات المتجر', store.total.toLocaleString('en-US'))}` : ''}</div>
<section class="card"><h2>نشاط آخر 14 يوم</h2>${chart(days)}</section>
<section class="card"><h2>تفصيل لكل منشور</h2>${detailed ? (perPost.length ? `<div class="table-wrap"><table><thead><tr><th>المنشور</th><th>تعليقات</th><th>انرد عليها</th><th>انفلترت</th><th>تجاوز</th></tr></thead><tbody>
  ${perPost.map((p) => `<tr><td dir="ltr" class="small">${esc(p.postId)}</td><td>${p.total}</td><td>${p.replied}</td><td>${p.filtered}</td><td>${p.skipped}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">لسا ما في تعليقات.</p>') : `<p class="muted">الإحصائيات التفصيلية لكل منشور ضمن باقة ماكس. ${lock('detailedReports')}</p>`}</section>
<section><h2>سجل الحوادث والتنبيهات</h2>${incidents.length ? logRows(incidents.slice(0, 30)) : '<p class="muted">ما في مشاكل</p>'}</section>
<section><h2>سجل النشاط</h2>${logRows(logs)}</section>`);
}

function teamPage(ctx, users) {
  const rows = users.map((u) => `<div class="acc"><div class="acc-main"><div class="acc-name">${esc(u.name || u.username)}</div>
    <div class="muted small"><bdi dir="ltr">${esc(u.username)}</bdi> · ${u.role === 'admin' ? 'مدير' : 'محرر'}</div></div>
    ${u.id === ctx.user.id ? '<span class="tag">أنت</span>' : `<form method="post" action="/team/${u.id}/delete" data-confirm="أكيد بدك تحذف ${esc(u.username)}؟"><button class="btn danger-btn sm">حذف</button></form>`}</div>`).join('');
  return layout({ ...ctx, active: 'team' }, 'فريق الإدارة', `
${pageHead('فريق الإدارة', '', 'كل واحد إله اسم مستخدم وكلمة سر خاصين فيه')}
<div class="list">${rows}</div>
<section class="card">
  <h2>+ إضافة عضو</h2>
  <form method="post" action="/team">
    <div class="grid2">
      <div><label>الاسم</label><input name="name" placeholder="مثلاً: أحمد"></div>
      <div><label>اسم المستخدم</label><input name="username" dir="ltr" autocapitalize="none" placeholder="ahmad" required></div>
    </div>
    <div class="grid2">
      <div><label>كلمة السر</label><input name="password" type="password" minlength="8" required></div>
      <div><label>الصلاحية</label><select name="role"><option value="admin">مدير (كل شي + الفريق)</option><option value="editor">محرر (الردود والمتجر والرسائل)</option></select></div>
    </div>
    <button class="btn">إضافة</button>
  </form>
</section>`);
}

function mePage(ctx) {
  return layout({ ...ctx, active: 'me' }, 'حسابي', `
${pageHead('حسابي', '', `<bdi dir="ltr">${esc(ctx.user.username)}</bdi>`)}
<section class="card">
  <h2>الاسم</h2>
  <form method="post" action="/me/name" class="row"><input name="name" value="${esc(ctx.user.name || '')}" style="flex:1"><button class="btn">حفظ</button></form>
</section>
<section class="card">
  <h2>تغيير كلمة السر</h2>
  <p class="muted small">بعد التغيير لازم تسجّل دخول من جديد على كل الأجهزة.</p>
  <form method="post" action="/me/password">
    <input type="password" name="current" placeholder="كلمة السر الحالية" required>
    <input type="password" name="password" placeholder="كلمة السر الجديدة" minlength="8" required>
    <button class="btn">تغيير</button>
  </form>
</section>`);
}

function installPage(ctx) {
  return layout({ ...ctx, active: 'install' }, 'تثبيت التطبيق', `
${pageHead('ثبّت شفق بوت كتطبيق', '<button class="btn" data-install-btn hidden>تثبيت الآن</button>')}
<div class="card install-ok" data-installed hidden>التطبيق مثبّت وشغّال كتطبيق.</div>
<section class="card"><h2>أندرويد (Chrome)</h2><ol class="steps"><li>افتح الموقع بـ Chrome.</li><li>اكبس زر <b>تثبيت الآن</b> فوق، أو من قائمة ⋮ اختار <b>تثبيت التطبيق</b> (Install app).</li><li>بيطلع أيقونة شفق بوت عالشاشة الرئيسية، وبيفتح متل أي تطبيق.</li></ol></section>
<section class="card"><h2>آيفون (Safari)</h2><ol class="steps"><li>افتح الموقع بـ <b>Safari</b> (مو كروم).</li><li>اكبس زر المشاركة <b></b> تحت.</li><li>اختار <b>إضافة إلى الشاشة الرئيسية</b> (Add to Home Screen) ← إضافة.</li></ol></section>
<section class="card"><h2>لابتوب (Chrome أو Edge)</h2><ol class="steps"><li>افتح الموقع.</li><li>اكبس أيقونة التثبيت ⊕ بآخر شريط العنوان، أو زر <b>تثبيت الآن</b> فوق.</li><li>بيصير إله أيقونة عالديسكتوب وشريط المهام.</li></ol></section>
<p class="muted small">التطبيق بيتحدّث لحاله كل ما رفعت نسخة جديدة على السيرفر — ما في داعي تنزّله من جديد.</p>`);
}

function privacyPage() {
  return bare('سياسة الخصوصية', `<main><div class="card prose">
<h1>سياسة الخصوصية</h1>
<p>شفق بوت هو أداة من <b>شفق ميديا</b> بيستخدمها أصحاب الصفحات والحسابات لإرسال ردود تلقائية على الرسائل والتعليقات اللي بتوصلهم على فيسبوك وإنستغرام، وعرض متجر وإرسال رسائل للمتابعين اللي راسلوا الصفحة.</p>
<h2>شو البيانات اللي منستخدمها</h2>
<p>نص الرسالة أو التعليق، رقم المرسل عند Meta، واسمه العام — فقط لنعرف أي رد لازم ينبعت، ولنحفظ الطلبيات اللي بيطلبها الشخص من المتجر. منحفظ سجل مختصر لآخر النشاط حتى صاحب الحساب يراجع شغل البوت.</p>
<h2>شو ما منعمله</h2>
<p>ما منبيع ولا منشارك أي بيانات مع أي طرف تالت، وما منستخدمها لإعلانات.</p>
<h2>حذف البيانات</h2>
<p>لطلب حذف أي بيانات إلك، راسلنا على <a href="mailto:shafqmedia@gmail.com">shafqmedia@gmail.com</a> أو بالدايركت على <a href="https://instagram.com/shafq.media">@shafq.media</a>. شوف <a href="/data-deletion">تعليمات حذف البيانات</a>.</p>
</div></main>`);
}

function dataDeletionPage() {
  return bare('حذف البيانات', `<main><div class="card prose">
<h1>تعليمات حذف البيانات</h1>
<ol>
<li>روح على إعدادات حساب فيسبوك ← الأمان وتسجيل الدخول ← التطبيقات والمواقع (Business Integrations).</li>
<li>لاقي هالتطبيق واكبس "إزالة".</li>
<li>أو راسلنا على <a href="mailto:shafqmedia@gmail.com">shafqmedia@gmail.com</a> وبنحذف كل البيانات المرتبطة فيك خلال 7 أيام.</li>
</ol>
</div></main>`);
}

const notFoundPage = (ctx) => layout(ctx, 'مو موجودة', empty('الصفحة مو موجودة', '<a class="btn" href="/">رجوع</a>'));

module.exports = {
  accountsPage, pickPages, homePage, subscribersPage, reportsPage, logRows, teamPage, mePage, installPage,
  privacyPage, dataDeletionPage, notFoundPage,
};
