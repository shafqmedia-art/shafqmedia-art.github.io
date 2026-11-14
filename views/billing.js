// الاشتراك والباقات (عند الزبون)
const { esc, attr, fmtTime, fmtDate, layout, pageHead, imagePicker, empty, icon } = require('./ui');
const { plansTable } = require('./public');
const P = require('../lib/plans');

const REQ_STATUS = { pending: '<span class="tag warn">قيد المراجعة</span>', approved: '<span class="tag ok">مقبول</span>', rejected: '<span class="tag bad">مرفوض</span>' };
const fmt = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('en-US'));

function billingPage(ctx, { plans, requests, settings: s, pagesUsed }) {
  const t = ctx.tenant;
  const st = P.status(t);
  const plan = ctx.plan;
  const bal = P.aiBalance(t);
  const line = (k, v) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
  const reqRows = requests.map((r) => `<tr><td>${fmtTime(r.createdAt)}</td><td>${esc(P.getPlan(r.planId)?.name || r.planId)}<div class="muted small">${P.PERIODS[r.period]} · ${P.PLATFORMS[r.platforms]}</div></td>
    <td dir="ltr">${r.amount ? `${fmt(r.amount)} ${esc(s.currency)}` : '—'}</td><td>${REQ_STATUS[r.status]}${r.note ? `<div class="muted small">${esc(r.note)}</div>` : ''}</td></tr>`).join('');
  return layout({ ...ctx, active: 'billing' }, 'الاشتراك', `
${pageHead('الاشتراك والباقات')}
<section class="card sub-card st-${st}">
  <div class="row between"><h2>${esc(plan?.name || 'بدون باقة')}</h2><span class="tag ${st === 'active' ? 'ok' : st === 'trial' ? 'warn' : 'bad'}">${P.STATUS_LABEL[st]}</span></div>
  ${line('الحساب', esc(t.name))}
  ${st === 'trial' ? line('التجربة بتخلص', fmtDate(t.trialEndsAt)) : ''}
  ${t.expiresAt ? line(st === 'expired' ? 'انتهى بتاريخ' : 'ساري لـ', fmtDate(t.expiresAt)) : ''}
  ${line('المنصات', st === 'trial' ? 'فيسبوك + إنستغرام (تجربة)' : P.PLATFORMS[t.platforms] || '—')}
  ${line('الصفحات', `${pagesUsed} من ${P.pageLimit(t)}`)}
  ${line('رصيد شفق AI هالشهر', P.can(t, 'ai') ? (bal === Infinity ? 'غير محدود' : fmt(bal)) : '—')}
  <div class="row form-actions"><a class="btn" href="/billing/subscribe">${st === 'active' ? 'تجديد / ترقية' : 'اشترك الآن'}</a><a class="btn ghost" href="/billing/subscribe">استخدام كوبون</a></div>
</section>
${requests.some((r) => r.status === 'pending') ? '<div class="flash">عندك طلب اشتراك قيد المراجعة — رح نفعّله بأقرب وقت.</div>' : ''}
<section><h2>الباقات</h2>${plansTable(plans, s, { current: st === 'active' ? t.planId : '', cta: (p) => `<a class="btn sm" href="/billing/subscribe?plan=${p.id}">${st === 'active' && t.planId === p.id ? 'جدّد' : 'اختار'}</a>` })}</section>
<section><h2>طلباتي</h2>${reqRows ? `<div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>الباقة</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>${reqRows}</tbody></table></div>` : '<p class="muted">ما في طلبات لسا.</p>'}</section>
`);
}

function subscribePage(ctx, { plans, settings: s, planId, coupon = '', error = '' }) {
  const t = ctx.tenant;
  const data = plans.map((p) => ({ id: p.id, name: p.name, prices: p.prices || {} }));
  const sel = planId || (P.status(t) === 'active' ? t.planId : plans.find((p) => p.highlight)?.id) || plans[0]?.id;
  return layout({ ...ctx, active: 'billing' }, 'اشتراك', `
${pageHead('طلب اشتراك / تجديد', '<a class="btn ghost" href="/billing">رجوع</a>')}
${error ? `<div class="flash err">${esc(error)}</div>` : ''}
<form method="post" action="/billing/subscribe" class="card form" data-subscribe data-plans="${attr(data)}" data-currency="${esc(s.currency)}" data-bonus="${s.bonusSecondPage ? 1 : 0}">
  <label>الباقة</label>
  <div class="pick-grid">${plans.map((p) => `<label class="pick-card"><input type="radio" name="planId" value="${p.id}" ${p.id === sel ? 'checked' : ''}><b>${esc(p.name)}</b><small class="muted">${esc(p.tagline || '')}</small></label>`).join('')}</div>
  <label>المدة</label>
  <div class="seg">${Object.entries(P.PERIODS).map(([k, l], i) => `<label><input type="radio" name="period" value="${k}" ${i === 0 ? 'checked' : ''}> ${l}</label>`).join('')}</div>
  <label>المنصات</label>
  <div class="seg">${Object.entries(P.PLATFORMS).map(([k, l]) => `<label><input type="radio" name="platforms" value="${k}" ${k === (t.platforms || 'fbig') ? 'checked' : ''}> ${l}</label>`).join('')}</div>
  <label>كوبون خصم <span class="muted small">(اختياري)</span></label>
  <div class="row"><input name="coupon" value="${esc(coupon)}" dir="ltr" placeholder="SHAFQ10" style="flex:1"><button class="btn ghost sm" type="button" data-check-coupon>تحقق</button></div>
  <div class="price-box" data-price-box><span class="muted">المبلغ:</span> <b data-price>—</b> <span class="muted small" data-coupon-msg></span><div class="small muted" data-bonus-msg hidden>مع هالمدة بتحصل على صفحة تانية مجاناً.</div></div>

  <div class="note-box pre">${esc(s.paymentInfo)}</div>
  <label>رقم العملية</label><input name="txn" dir="ltr" placeholder="مثلاً: 48213377">
  <label>طريقة الدفع</label><input name="bank" placeholder="مثلاً: شام كاش">
  ${imagePicker('receipt', '', 'صورة الإشعار (اختياري)')}
  <label>ملاحظات</label><textarea name="notes" rows="2"></textarea>
  <p class="muted small">بيكفي رقم العملية أو صورة الإشعار. فريق شفق بيتأكد من الدفع وبيفعّل باقتك.</p>
  <div class="row form-actions"><button class="btn">إرسال الطلب</button><a class="btn danger-btn" href="/billing">إلغاء</a></div>
</form>`);
}

const FEATURE_LABEL = Object.fromEntries(P.FEATURES.map((f) => [f.key, f.label]));

function upgradePage(ctx, feature) {
  const plans = P.listPlans().filter((p) => p.features?.[feature]);
  const st = P.status(ctx.tenant);
  return layout(ctx, 'ترقية', `
<div class="card center empty upgrade">
  <div class="big-ic">${icon('lock', 'ic xl')}</div>
  <h1>${esc(FEATURE_LABEL[feature] || 'هالميزة')}</h1>
  <p class="muted">${st === 'expired' ? 'اشتراكك منتهي.' : `هالميزة مو ضمن باقتك الحالية (${esc(ctx.plan?.name || '—')}).`}</p>
  ${plans.length ? `<p>متوفرة بـ: ${plans.map((p) => `<b>${esc(p.name)}</b>`).join(' · ')}</p>` : ''}
  <a class="btn" href="/billing/subscribe${plans[0] ? `?plan=${plans[0].id}` : ''}">ترقية الباقة</a>
</div>`);
}

module.exports = { billingPage, subscribePage, upgradePage, REQ_STATUS };
