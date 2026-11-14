// الحملات (رسائل جماعية)
const { esc, fmtTime, layout, pageHead, empty, icon } = require('./ui');
const { builder } = require('./autoreply');
const { TAGS, NOTIFICATIONS } = require('../lib/broadcast');

const STATUS = { draft: 'مسودة', scheduled: 'مجدولة', sending: 'عم ينبعت...', sent: 'تم الإرسال' };

function listPage(ctx, items, q, lastSent) {
  const base = `/a/${ctx.acc.id}/broadcasts`;
  const list = items.filter((b) => !q || b.name.includes(q));
  const rows = list.map((b) => `<tr><td><span class="tag ${b.status === 'sent' ? 'ok' : b.status === 'scheduled' ? 'warn' : ''}">${STATUS[b.status] || b.status}</span></td>
    <td><a href="${base}/${b.id}"><b>${esc(b.name)}</b></a>${b.status === 'sent' ? `<div class="muted small">وصلت لـ ${b.sent || 0}${b.failed ? ` · فشل ${b.failed}` : ''}</div>` : ''}</td>
    <td>${fmtTime(b.updatedAt)}</td><td>${b.sentAt ? fmtTime(b.sentAt) : b.status === 'scheduled' ? fmtTime(new Date(b.at).getTime()) : '—'}</td></tr>`).join('');
  const week = lastSent && Date.now() - lastSent < 7 * 864e5;
  return layout({ ...ctx, active: 'broadcasts' }, 'الحملات', `
${pageHead('الحملات', `<a class="btn" href="${base}/new">+ حملة جديدة</a>`)}
${week ? `<div class="flash err">انبعتت حملة من هالحساب بآخر 7 أيام (${fmtTime(lastSent)}). الأفضل حملة وحدة بالأسبوع.</div>` : ''}
<form class="search" method="get"><input name="q" value="${esc(q)}" placeholder="بحث"></form>
${list.length ? `<div class="table-wrap"><table><thead><tr><th>الحالة</th><th>الاسم</th><th>آخر تعديل</th><th>أُرسل في</th></tr></thead><tbody>${rows}</tbody></table></div>` : empty('ما في حملات لسا.')}
${notes()}`);
}

function notes() {
  return `<details class="card notes"><summary><b>قبل ما تبعت حملة</b></summary><ul>
<li>الحملة بتوصل للي راسلوا الحساب أو ضغطوا زر خلال آخر شهرين — كل ما زاد تفاعل الناس مع البوت والمتجر، بيكبر جمهورك.</li>
<li>اللي تواصلوا خلال آخر 24 ساعة بتوصلهم الرسالة عادي، والباقي بتنبعتلهم حسب <b>نوع الرسالة</b> اللي بتختاره — اختار النوع الصحيح، لأنو Meta بتمنع الإعلانات المباشرة بهالطريقة.</li>
<li>حملة وحدة بالأسبوع كافية وبتحمي الصفحة.</li>
<li>الإرسال بيصير على دفعات خلال دقايق، وبتقدر تتابع مين استلم من صفحة الحملة.</li>
</ul></details>`;
}

function formPage(ctx, b, { blocks, accounts, audienceCount, posts }) {
  const acc = ctx.acc;
  const x = b || { audience: 'all', tag: 'CONFIRMED_EVENT_UPDATE', notification: 'REGULAR', schedule: 'now', accounts: [acc.id], message: { items: [] } };
  const locked = b && (b.status === 'sent' || b.status === 'sending');
  const radio = (name, val, label, cur) => `<label><input type="radio" name="${name}" value="${val}" ${cur === val ? 'checked' : ''}> ${label}</label>`;
  const multi = (x.accounts || []).length > 1;
  return layout({ ...ctx, active: 'broadcasts' }, b ? b.name : 'حملة جديدة', `
${pageHead(b ? esc(b.name) : 'إعدادات الحملة', `<a class="btn ghost" href="/a/${acc.id}/broadcasts">رجوع</a>`)}
${locked ? resultBox(b) : ''}
<form method="post" action="/a/${acc.id}/broadcasts/${b ? b.id : 'new'}" class="card form" ${locked ? 'data-readonly' : ''}>
  <label>الاسم <span class="muted small">(بيظهر إلك بس)</span></label>
  <input name="name" value="${esc(x.name || 'حملة جديدة')}" required>
  <label>لمين تنبعت</label>
  <div class="seg">${radio('audience', 'all', 'كل المتابعين', x.audience)}${radio('audience', 'post', 'اللي تفاعلوا مع منشور', x.audience)}</div>
  <div data-show-when="audience=post">
    <p class="muted small">بس للي علّقوا على هالمنشور ووصلهم رد خاص منه.</p>
    <select name="postId"><option value="">اختار المنشور</option>${posts.map((p) => `<option value="${esc(p.id)}" ${x.postId === p.id ? 'selected' : ''}>${esc((p.text || p.id).slice(0, 70))}</option>`).join('')}</select>
  </div>
  <p class="muted small">الجمهور حالياً: <b>${audienceCount}</b> متابع تواصلوا بآخر شهرين.</p>
  <label>نوع الرسالة</label>
  <select name="tag">${Object.entries(TAGS).map(([k, l]) => `<option value="${k}" ${x.tag === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
  <label>الإشعار <span class="muted small"></span></label>
  <div class="seg col">${Object.entries(NOTIFICATIONS).map(([k, l]) => radio('notification', k, l, x.notification)).join('')}</div>
  <label>وقت الإرسال</label>
  <div class="seg">${radio('schedule', 'now', 'هلق', x.schedule)}${radio('schedule', 'later', 'بوقت محدد', x.schedule)}</div>
  <div data-show-when="schedule=later"><input type="datetime-local" name="at" value="${esc(x.at || '')}"></div>

  <fieldset class="box"><legend>الحسابات</legend>
    <div class="seg">${radio('scopePages', 'one', 'هالحساب بس', multi ? 'many' : 'one')}${radio('scopePages', 'many', 'كذا حساب', multi ? 'many' : 'one')}</div>
    <div data-show-when="scopePages=many">${accounts.map((a) => `<label class="check"><input type="checkbox" name="accounts" value="${a.id}" ${(x.accounts || []).includes(a.id) || a.id === acc.id ? 'checked' : ''} ${a.id === acc.id ? 'disabled' : ''}> ${esc(a.username || a.name)} <span class="muted small">${a.platform === 'instagram' ? 'إنستغرام' : 'فيسبوك'}</span></label>`).join('')}</div>
  </fieldset>

  <label>محتوى الرسالة</label>
  ${builder('message', x.message, blocks, 'ابني الرسالة من نص وصور وأزرار. {name} بيتبدّل باسم الشخص.')}

  ${locked ? '' : `<div class="row form-actions">
    <button class="btn dark" name="action" value="save">حفظ</button>
    <button class="btn" name="action" value="send" data-confirm="رح تنبعت الرسالة لكل المستخدمين المختارين. متأكد؟">أرسل</button>
    <a class="btn danger-btn" href="/a/${acc.id}/broadcasts">إلغاء</a></div>`}
</form>
${b ? `<form method="post" action="/a/${acc.id}/broadcasts/${b.id}/delete" data-confirm="حذف الرسالة؟"><button class="btn danger-btn sm">حذف</button></form>` : ''}`);
}

function resultBox(b) {
  const rows = (b.recipients || []).slice(0, 300).map((r) => `<tr><td>${esc(r.name || r.psid)}</td><td>${esc(r.account)}</td><td>${r.ok ? '<span class="tag ok">وصلت</span>' : `<span class="tag bad" title="${esc(r.error)}">فشل</span>`}</td></tr>`).join('');
  return `<section class="card"><h2>حالة الإرسال: ${STATUS[b.status]}</h2>
  <div class="kpis"><div class="kpi"><small>وصلت</small><b>${b.sent || 0}</b></div><div class="kpi"><small>فشلت</small><b>${b.failed || 0}</b></div><div class="kpi"><small>المجموع</small><b>${b.total ?? '…'}</b></div></div>
  ${rows ? `<details><summary>مين استلم الرسالة</summary><div class="table-wrap"><table><thead><tr><th>الاسم</th><th>الحساب</th><th>الحالة</th></tr></thead><tbody>${rows}</tbody></table></div></details>` : ''}
  ${b.status === 'sending' ? '<p class="muted small">الصفحة بتتحدّث لحالها...</p><meta http-equiv="refresh" content="5">' : ''}</section>`;
}

module.exports = { listPage, formPage, STATUS };
