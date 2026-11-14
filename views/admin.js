// لوحة المنصة (لمدير المنصة بس): الزباين، الطلبات، الباقات، الكوبونات، الإعدادات
const { esc, safeUrl, fmtTime, fmtDate, layout, pageHead, empty, icon } = require('./ui');
const P = require('../lib/plans');
const { REQ_STATUS } = require('./billing');

const fmt = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('en-US'));
const tabs = (act) => `<div class="tabs">${[['/admin', 'نظرة عامة', 'home'], ['/admin/tenants', 'الزباين', 'tenants'], ['/admin/requests', 'طلبات الاشتراك', 'requests'], ['/admin/plans', 'الباقات والأسعار', 'plans'], ['/admin/coupons', 'الكوبونات', 'coupons'], ['/admin/settings', 'الإعدادات', 'settings'], ['/admin/security', 'الأمان', 'security']]
  .map(([h, l, k]) => `<a href="${h}" class="${act === k ? 'on' : ''}">${l}</a>`).join('')}</div>`;
const statusTag = (t) => { const st = P.status(t); return `<span class="tag ${st === 'active' ? 'ok' : st === 'trial' ? 'warn' : 'bad'}">${P.STATUS_LABEL[st]}</span>`; };
const toLocalInput = (ms) => (ms ? new Date(ms - new Date().getTimezoneOffset() * 60e3).toISOString().slice(0, 10) : '');

function dashboard(ctx, { tenants, pending, revenue, accounts }) {
  const count = (st) => tenants.filter((t) => P.status(t) === st).length;
  const box = (l, n, href = '') => `<a class="kpi" ${href ? `href="${href}"` : ''}><small>${l}</small><b>${n}</b></a>`;
  return layout({ ...ctx, active: 'admin' }, 'لوحة المنصة', `
${pageHead('لوحة المنصة')}${tabs('home')}
<div class="kpis">
  ${box('الزباين', tenants.length, '/admin/tenants')}${box('فعّال', count('active'), '/admin/tenants?st=active')}${box('تجربة', count('trial'), '/admin/tenants?st=trial')}
  ${box('منتهي', count('expired'), '/admin/tenants?st=expired')}${box('طلبات بالانتظار', pending.length, '/admin/requests')}${box('صفحات مربوطة', accounts)}
  ${box(`دخل هالشهر (${esc(P.settings().currency)})`, fmt(revenue.month))}${box('الدخل الكلي', fmt(revenue.all))}
</div>
<section><h2>طلبات بالانتظار</h2>${pending.length ? requestsTable(pending.slice(0, 10)) : '<p class="muted">ما في طلبات جديدة</p>'}</section>`);
}

function tenantsPage(ctx, { tenants, q, st }) {
  const rows = tenants.map((t) => `<tr><td><a href="/admin/tenants/${t.id}"><b>${esc(t.name)}</b></a><div class="muted small" dir="ltr">${esc(t.ownerUsername || '')} ${t.phone ? `· ${esc(t.phone)}` : ''}</div></td>
    <td>${esc(P.effectivePlan(t)?.name || '—')}</td><td>${statusTag(t)}</td><td>${t.expiresAt ? fmtDate(t.expiresAt) : t.trialEndsAt ? `تجربة لـ ${fmtDate(t.trialEndsAt)}` : '—'}</td><td>${t.accountsCount}</td></tr>`).join('');
  return layout({ ...ctx, active: 'admin' }, 'الزباين', `
${pageHead('الزباين')}${tabs('tenants')}
<form class="row search" method="get"><input name="q" value="${esc(q)}" placeholder="بحث بالاسم أو الرقم أو اسم المستخدم" style="flex:1">
<select name="st"><option value="">الكل</option>${Object.entries(P.STATUS_LABEL).filter(([k]) => k !== 'none').map(([k, l]) => `<option value="${k}" ${st === k ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn sm">فلترة</button></form>
${rows ? `<div class="table-wrap"><table><thead><tr><th>الزبون</th><th>الباقة</th><th>الحالة</th><th>لـ</th><th>صفحات</th></tr></thead><tbody>${rows}</tbody></table></div>` : empty('ما في زباين.')}`);
}

function tenantPage(ctx, { t, users, accounts, requests, plans }) {
  const ai = t.aiUsage?.[P.monthKey()] || 0;
  return layout({ ...ctx, active: 'admin' }, t.name, `
${pageHead(esc(t.name), `<form method="post" action="/admin/tenants/${t.id}/enter"><button class="btn dark">دخول كزبون</button></form>`, statusTag(t))}${tabs('tenants')}
<div class="grid2">
<section class="card">
  <h2>المعلومات</h2>
  ${users.map((u) => `<div class="kv"><span>${u.role === 'admin' ? 'المدير' : 'محرر'}</span><b>${esc(u.name || '')} · <bdi dir="ltr">${esc(u.username)}</bdi></b></div>`).join('')}
  <div class="kv"><span>الواتساب</span><b dir="ltr">${esc(t.phone || '—')}</b></div>
  <div class="kv"><span>سجّل</span><b>${fmtDate(t.createdAt)}</b></div>
  <div class="kv"><span>رصيد AI المستخدم هالشهر</span><b>${fmt(ai)}</b></div>
  <h3>الصفحات المربوطة</h3>
  ${accounts.length ? accounts.map((a) => `<div class="kv"><span>${a.platform === 'instagram' ? 'إنستغرام' : 'فيسبوك'}</span><b>${esc(a.username || a.name)}</b></div>`).join('') : '<p class="muted small">ما ربط ولا صفحة لسا.</p>'}
</section>
<form method="post" action="/admin/tenants/${t.id}" class="card form">
  <h2>الاشتراك</h2>
  <label>الباقة</label><select name="planId">${plans.map((p) => `<option value="${p.id}" ${t.planId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
  <label>المنصات</label><select name="platforms">${Object.entries(P.PLATFORMS).map(([k, l]) => `<option value="${k}" ${t.platforms === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
  <div class="grid2"><div><label>الاشتراك ساري لـ</label><input type="date" name="expiresAt" value="${toLocalInput(t.expiresAt)}"></div>
  <div><label>التجربة لـ</label><input type="date" name="trialEndsAt" value="${toLocalInput(t.trialEndsAt)}"></div></div>
  <div class="grid2"><div><label>صفحات إضافية</label><input type="number" min="0" name="extraPages" value="${Number(t.extraPages) || 0}"></div>
  <div><label>رصيد AI إضافي (شهري)</label><input type="number" min="0" name="aiExtra" value="${Number(t.aiExtra) || 0}"></div></div>
  <label class="check"><input type="checkbox" name="bonusPage" ${t.bonusPage ? 'checked' : ''}> صفحة تانية مجاناً (هدية)</label>
  <label class="check"><input type="checkbox" name="suspended" ${t.status === 'suspended' ? 'checked' : ''}> إيقاف الحساب</label>
  <div class="row form-actions"><button class="btn">حفظ</button>
    <button class="btn ghost" formaction="/admin/tenants/${t.id}/extend?days=30">+30 يوم</button>
    <button class="btn ghost" formaction="/admin/tenants/${t.id}/extend?days=7">+7 أيام</button></div>
</form>
</div>
<section><h2>طلبات الاشتراك</h2>${requests.length ? requestsTable(requests, false) : '<p class="muted">ما في طلبات.</p>'}</section>
<details class="card"><summary class="bad-text"><b>حذف الزبون نهائياً</b></summary>
  <p class="muted small">رح ينحذف الزبون مع كل مستخدميه وصفحاته وبياناته من المنصة.</p>
  <form method="post" action="/admin/tenants/${t.id}/delete" data-confirm="حذف ${esc(t.name)} نهائياً؟"><button class="btn danger-btn">حذف</button></form>
</details>`);
}

function requestsTable(list, showTenant = true) {
  const cur = esc(P.settings().currency);
  return `<div class="req-list">${list.map((r) => `
  <div class="card req">
    <div class="row between">${showTenant ? `<a href="/admin/tenants/${r.tenantId}"><b>${esc(r.tenantName || '')}</b></a>` : ''}<span>${REQ_STATUS[r.status]}</span><span class="muted small">${fmtTime(r.createdAt)}</span></div>
    <div class="req-body">
      ${r.receipt ? `<a href="${safeUrl(r.receipt)}" target="_blank" rel="noopener" class="receipt"><img src="${safeUrl(r.receipt)}" alt="الإشعار"></a>` : ''}
      <div>
        <div class="kv"><span>الباقة</span><b>${esc(P.getPlan(r.planId)?.name || r.planId)} · ${P.PERIODS[r.period]} · ${P.PLATFORMS[r.platforms]}</b></div>
        <div class="kv"><span>المبلغ</span><b dir="ltr">${r.amount ? `${fmt(r.total)} ${cur}${r.discount ? ` (خصم ${fmt(r.discount)} · ${esc(r.coupon)})` : ''}` : '—'}</b></div>
        <div class="kv"><span>رقم العملية</span><b dir="ltr">${esc(r.txn || '—')}</b></div>
        <div class="kv"><span>البنك / الشركة</span><b>${esc(r.bank || '—')}</b></div>
        ${r.notes ? `<div class="kv"><span>ملاحظات</span><b>${esc(r.notes)}</b></div>` : ''}
        ${r.note ? `<div class="kv"><span>ردّك</span><b>${esc(r.note)}</b></div>` : ''}
      </div>
    </div>
    ${r.status === 'pending' ? `<form method="post" action="/admin/requests/${r.id}" class="row">
      <input name="note" placeholder="ملاحظة للزبون (اختياري)" style="flex:1;min-width:160px">
      <button class="btn" name="action" value="approve">قبول وتفعيل</button>
      <button class="btn danger-btn" name="action" value="reject" data-confirm="رفض الطلب؟">رفض</button></form>` : ''}
  </div>`).join('')}</div>`;
}

function requestsPage(ctx, list) {
  return layout({ ...ctx, active: 'admin' }, 'طلبات الاشتراك', `${pageHead('طلبات الاشتراك')}${tabs('requests')}${list.length ? requestsTable(list) : empty('ما في طلبات.')}`);
}

function plansPage(ctx, plans, settings) {
  const priceGrid = (p) => `<div class="table-wrap"><table class="price-grid"><thead><tr><th></th>${Object.values(P.PLATFORMS).map((l) => `<th>${l}</th>`).join('')}</tr></thead><tbody>
    ${Object.entries(P.PERIODS).map(([per, l]) => `<tr><th>${l}</th>${Object.keys(P.PLATFORMS).map((pl) => `<td><input type="number" min="0" step="any" name="price_${pl}_${per}" value="${p.prices?.[pl]?.[per] || ''}" placeholder="—"></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const form = (p) => `
  <details class="card plan-edit" ${plans.length === 1 ? 'open' : ''}>
    <summary><b>${esc(p.name)}</b> ${p.active === false ? '<span class="tag">مخفية</span>' : ''} ${p.highlight ? '<span class="tag warn">مميزة</span>' : ''}</summary>
    <form method="post" action="/admin/plans/${p.id}" class="form">
      <div class="grid2"><div><label>الاسم</label><input name="name" value="${esc(p.name)}" required></div><div><label>وصف قصير</label><input name="tagline" value="${esc(p.tagline || '')}"></div></div>
      <div class="grid2"><div><label>عدد الصفحات</label><input type="number" min="1" name="pages" value="${p.pages || 1}"></div><div><label>رصيد AI الشهري</label><input type="number" min="0" name="aiCredits" value="${p.aiCredits || 0}"></div></div>
      <div class="grid2"><div><label>الترتيب</label><input type="number" name="order" value="${p.order || 0}"></div><div>
        <label class="check"><input type="checkbox" name="highlight" ${p.highlight ? 'checked' : ''}> الأكثر طلباً</label>
        <label class="check"><input type="checkbox" name="statsDetailed" ${p.statsDetailed ? 'checked' : ''}> إحصائيات تفصيلية لكل منشور</label>
        <label class="check"><input type="checkbox" name="active" ${p.active !== false ? 'checked' : ''}> ظاهرة للزباين</label></div></div>
      <h3>المزايا</h3>
      <div class="feat-checks">${P.FEATURES.map((f) => `<label class="check"><input type="checkbox" name="f_${f.key}" ${p.features?.[f.key] ? 'checked' : ''}> ${f.label}</label>`).join('')}</div>
      <h3>الأسعار <span class="muted small">(${esc(settings.currency)} — اتركها فاضية إذا لسا ما حددت)</span></h3>
      ${priceGrid(p)}
      <button class="btn">حفظ الباقة</button>
    </form>
  </details>`;
  return layout({ ...ctx, active: 'admin' }, 'الباقات', `
${pageHead('الباقات والأسعار', '<a class="btn ghost" href="/pricing" target="_blank">شوف صفحة الأسعار</a>')}${tabs('plans')}
${plans.map(form).join('')}
<form method="post" action="/admin/plans" class="row"><input name="name" placeholder="اسم باقة جديدة" required style="flex:1"><button class="btn">+ إضافة باقة</button></form>`);
}

function couponsPage(ctx, coupons, plans) {
  const rows = coupons.map((c) => `<tr><td><b dir="ltr">${esc(c.code)}</b></td><td>${c.type === 'fixed' ? fmt(c.value) : `${c.value}%`}</td><td>${c.used || 0}${c.maxUses ? ` / ${c.maxUses}` : ''}</td>
    <td>${c.expiresAt ? fmtDate(new Date(c.expiresAt).getTime()) : '—'}</td><td>${(c.plans || []).map((id) => esc(P.getPlan(id)?.name || id)).join('، ') || 'الكل'}</td>
    <td><div class="ops"><form method="post" action="/admin/coupons/${c.id}/toggle"><button class="op ${c.active === false ? 'off' : 'on'}">${icon('power')}</button></form><form method="post" action="/admin/coupons/${c.id}/delete" data-confirm="حذف الكوبون؟"><button class="op">${icon('trash')}</button></form></div></td></tr>`).join('');
  return layout({ ...ctx, active: 'admin' }, 'الكوبونات', `
${pageHead('الكوبونات')}${tabs('coupons')}
${rows ? `<div class="table-wrap"><table><thead><tr><th>الكود</th><th>الخصم</th><th>الاستخدام</th><th>لـ</th><th>الباقات</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">ما في كوبونات.</p>'}
<form method="post" action="/admin/coupons" class="card form">
  <h2>+ كوبون جديد</h2>
  <div class="grid2"><div><label>الكود</label><input name="code" dir="ltr" placeholder="SHAFQ10" required></div>
  <div><label>النوع</label><select name="type"><option value="percent">نسبة %</option><option value="fixed">مبلغ ثابت</option></select></div></div>
  <div class="grid2"><div><label>القيمة</label><input type="number" min="0" step="any" name="value" required></div><div><label>أقصى عدد استخدام</label><input type="number" min="0" name="maxUses" placeholder="بلا حد"></div></div>
  <label>ينتهي بتاريخ</label><input type="date" name="expiresAt">
  <label>للباقات</label><div class="seg">${plans.map((p) => `<label><input type="checkbox" name="plans" value="${p.id}"> ${esc(p.name)}</label>`).join('')}</div>
  <p class="muted small">إذا ما اخترت باقة، الكوبون بيشتغل على الكل.</p>
  <button class="btn">إضافة</button>
</form>`);
}

function settingsPage(ctx, s, plans) {
  const mask = (k) => (k ? `${'•'.repeat(8)}${String(k).slice(-4)}` : '');
  return layout({ ...ctx, active: 'admin' }, 'إعدادات المنصة', `
${pageHead('إعدادات المنصة')}${tabs('settings')}
<form method="post" action="/admin/settings" class="card form">
  <h2>التسجيل والتجربة</h2>
  <label class="check"><input type="checkbox" name="signupOpen" ${s.signupOpen ? 'checked' : ''}> التسجيل مفتوح للزباين</label>
  <div class="grid2"><div><label>أيام التجربة المجانية</label><input type="number" min="0" name="trialDays" value="${s.trialDays}"></div>
  <div><label>باقة التجربة</label><select name="trialPlan">${plans.map((p) => `<option value="${p.id}" ${s.trialPlan === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div></div>
  <label class="check"><input type="checkbox" name="bonusSecondPage" ${s.bonusSecondPage ? 'checked' : ''}> صفحة تانية مجاناً لاشتراكات برو/ماكس 3 أشهر وأكتر</label>

  <h2>الدفع</h2>
  <div class="grid2"><div><label>العملة</label><input name="currency" value="${esc(s.currency)}" placeholder="USD / SYP / SAR"></div>
  <div><label>واتساب الدعم</label><input name="supportWhatsapp" dir="ltr" value="${esc(s.supportWhatsapp)}"></div></div>
  <label>تعليمات الدفع <span class="muted small">(بتظهر للزبون بصفحة الاشتراك)</span></label>
  <textarea name="paymentInfo" rows="5">${esc(s.paymentInfo)}</textarea>

  <h2>شفق AI</h2>
  <div class="grid2"><div><label>مزوّد النصوص</label><select name="aiProvider"><option value="anthropic" ${s.aiProvider !== 'openai' ? 'selected' : ''}>Claude (Anthropic)</option><option value="openai" ${s.aiProvider === 'openai' ? 'selected' : ''}>OpenAI</option></select></div>
  <div><label>موديل Claude</label><input name="aiModel" dir="ltr" value="${esc(s.aiModel)}"></div></div>
  <label>مفتاح Claude API <span class="muted small">${s.aiKey ? `(محفوظ ${mask(s.aiKey)} — اتركه فاضي لتخليه)` : ''}</span></label><input name="aiKey" dir="ltr" type="password" autocomplete="off" placeholder="sk-ant-...">
  <label>مفتاح OpenAI <span class="muted small">(لتوليد الصور، أو للنصوص إذا اخترت OpenAI) ${s.openaiKey ? `(محفوظ ${mask(s.openaiKey)})` : ''}</span></label><input name="openaiKey" dir="ltr" type="password" autocomplete="off" placeholder="sk-...">
  <div class="grid2"><div><label>موديل OpenAI للنصوص</label><input name="openaiModel" dir="ltr" value="${esc(s.openaiModel)}"></div><div><label>موديل الصور</label><input name="imageModel" dir="ltr" value="${esc(s.imageModel)}"></div></div>
  <p class="muted small">الرصيد بيتحسب بعدد التوكنات (كلمة عربية ≈ 2-3 توكن). الصورة الوحدة = 20,000 رصيد. فيك كمان تحط المفاتيح كمتغيرات بيئة: ANTHROPIC_API_KEY و OPENAI_API_KEY.</p>
  <button class="btn">حفظ</button>
</form>`);
}

const KIND_AR = { 'login-failed': 'دخول فاشل', 'rate-limit': 'طلبات كتيرة', 'csrf-blocked': 'طلب من موقع غريب', 'admin-denied': 'محاولة فتح صفحة المنصة', 'webhook-bad-signature': 'Webhook بتوقيع غلط' };
function securityPage(ctx, log) {
  const rows = log.slice().reverse().slice(0, 300).map((e) => `<tr><td>${fmtTime(e.at)}</td><td><span class="tag ${e.kind === 'login-failed' ? 'warn' : 'bad'}">${esc(KIND_AR[e.kind] || e.kind)}</span></td><td dir="ltr">${esc(e.ip)}</td><td dir="ltr" class="small">${esc(e.path)}</td><td class="small">${esc(e.detail)}</td></tr>`).join('');
  const byIp = {}; log.filter((e) => Date.now() - e.at < 864e5).forEach((e) => { byIp[e.ip] = (byIp[e.ip] || 0) + 1; });
  const top = Object.entries(byIp).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([ip, n]) => `<li><bdi dir="ltr">${esc(ip)}</bdi> · ${n}</li>`).join('');
  return layout({ ...ctx, active: 'admin' }, 'الأمان', `${pageHead('سجل الأمان', '')}${tabs('security')}
<div class="card"><p class="muted small">آخر 500 حدث مشبوه: دخول فاشل، طلبات كتيرة، طلبات من مواقع غريبة، أو حدا حاول يفتح صفحات المنصة. نفس السجل بيبيّن بـ Railway ← Deploy Logs بكلمة [SECURITY].</p>
${top ? `<h3>أكتر عناوين خلال آخر 24 ساعة</h3><ul>${top}</ul>` : ''}</div>
${rows ? `<div class="card table-wrap"><table><thead><tr><th>الوقت</th><th>النوع</th><th>IP</th><th>الرابط</th><th>تفاصيل</th></tr></thead><tbody>${rows}</tbody></table></div>` : empty('ما في أي نشاط مشبوه لهلّق.')}`);
}

module.exports = { dashboard, tenantsPage, tenantPage, requestsPage, plansPage, couponsPage, settingsPage, securityPage };
