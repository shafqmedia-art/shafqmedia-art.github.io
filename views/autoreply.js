// الردود التلقائية + الرد على الرسائل (الافتراضي والترحيب والستوري)
const { safeUrl, esc, attr, fmtDate, layout, pageHead, statusField, statusTag, imagePicker, empty, icon } = require('./ui');
const M = require('../lib/messages');
const P = require('../lib/plans');
const lock = (ctx, f) => (P.can(ctx.tenant, f) ? '' : ` <a href="/billing?upgrade=${f}" class="lock" title="مو ضمن باقتك — ترقية">${icon('lock', 'ic sm')} ترقية</a>`);

const blockOptions = (blocks) => blocks.map((b) => ({ id: b.id, name: b.name }));

function builder(name, spec, blocks, hint = '', textOnly = false) {
  return `<div class="mb" data-builder data-name="${name}" ${textOnly ? 'data-text-only' : ''} data-value="${attr(spec || { items: [] })}" data-blocks="${attr(blockOptions(blocks))}"></div>${textOnly ? '<p class="small">باقتك بتدعم رسائل نصية بس. <a href="/billing?upgrade=richDm">ترقّى</a> لتبعت صور وأزرار ومعارض.</p>' : ''}${hint ? `<p class="muted small">${hint}</p>` : ''}`;
}

function testBox(acc, testResult) {
  return `<section class="card">
  <h2>جرّب البوت</h2>
  <form method="post" action="/a/${acc.id}/replies/test" class="row">
    <input name="text" placeholder="اكتب رسالة أو تعليق متل ما بيكتبه زبون..." required style="flex:1;min-width:200px">
    <select name="kind"><option value="dm">دايركت</option><option value="comment">تعليق</option></select>
    <button class="btn">جرّب</button>
  </form>
  ${testResult ? `<div class="test-result">${testResult}</div>` : ''}
</section>`;
}

function repliesPage(ctx, { q, stats, testResult }) {
  const acc = ctx.acc;
  const base = `/a/${acc.id}/replies`;
  const rules = acc.rules.filter((r) => !q || `${r.title} ${(r.keywords || []).join(' ')}`.includes(q));
  const cards = rules.map((r) => `
  <div class="card rule-card ${r.status === 'inactive' ? 'dim' : ''}">
    <div class="row between"><h3>${esc(r.title || 'بدون عنوان')}</h3>
      <form method="post" action="${base}/${r.id}/toggle">${statusTag(r)}<button class="switch sm ${r.status !== 'inactive' ? 'on' : ''}" title="تفعيل / إيقاف"><i></i></button></form></div>
    <dl>
      <dt>على:</dt><dd>${{ both: 'التعليقات والدايركت', comment: 'التعليقات', dm: 'الدايركت' }[r.on || 'both']}</dd>
      <dt>منشور:</dt><dd>${r.scope === 'all' || !r.scope ? 'كل المنشورات' : r.postLink ? `<a href="${safeUrl(r.postLink)}" target="_blank" rel="noopener" class="ok-text">فتح المنشور</a>` : esc((r.postText || r.postId || '').slice(0, 60))}</dd>
      <dt>الكلمات:</dt><dd>${(r.keywords || []).length ? r.keywords.map((k) => `<span class="chip">${esc(k)}</span>`).join('') : '<span class="chip blue">أي تعليق</span>'}</dd>
      ${(r.publicReplies || []).length ? `<dt>الرد العلني:</dt><dd class="pre">${esc(r.publicReplies.join('\n'))}</dd>` : ''}
      ${M.isEmpty(r.dm) ? '' : `<dt>الخاص:</dt><dd class="pre">${esc(M.preview(r.dm))}</dd>`}
      <dt>انعمل:</dt><dd>${fmtDate(r.createdAt)}</dd>
    </dl>
    <div class="actions">
      <a href="${base}/${r.id}">${icon('edit', 'ic sm')} تعديل</a>
      <form method="post" action="${base}/${r.id}/copy"><button>${icon('copy', 'ic sm')} نسخ</button></form>
      <form method="post" action="${base}/${r.id}/delete" data-confirm="أكيد بدك تحذف هالرد؟"><button class="bad-text">${icon('trash', 'ic sm')} حذف</button></form>
      <span class="muted small">${icon('stats', 'ic sm')} ${stats[r.id] || 0} رد</span>
    </div>
  </div>`).join('');

  return layout({ ...ctx, active: 'replies' }, 'الردود التلقائية', `
${pageHead('الردود التلقائية', `<a class="btn" href="${base}/new">+ إضافة رد جديد</a>`)}
<div class="row wrap-gap">
  <form class="search" method="get" style="flex:1"><input name="q" value="${esc(q)}" placeholder="بحث"></form>
  <form method="post" action="${base}/toggle-all"><button class="btn ghost sm">إيقاف / تشغيل الكل</button></form>
</div>
${testBox(acc, testResult)}
${cards || empty('ما في ردود لسا.', `<a class="btn" href="${base}/new">+ إضافة أول رد</a>`)}
${notes()}`);
}

function notes() {
  return `<details class="card notes"><summary><b>نصائح لنتيجة أحسن</b></summary><ul>
<li>بيشتغل على صفحات فيسبوك وحسابات إنستغرام الاحترافية (Business أو Creator).</li>
<li>بدون كلمات مفتاحية، الرد بيشتغل على أي تعليق. مع كلمات، بس على التعليقات اللي فيها وحدة منها.</li>
<li>كتّر صيغ الرد العلني (كل سطر صيغة) — التكرار الحرفي بيعرّض الصفحة لتقييد من Meta.</li>
<li>Meta بتسمح برسالة خاصة وحدة على كل تعليق، خلال أسبوع من كتابته، وبتسمح بالرد على الدايركت خلال 24 ساعة من آخر رسالة.</li>
<li>التعليقات اللي انكتبت قبل ما تشغّل الرد، وتعليقات الصفحة نفسها، ما بينرد عليها.</li>
<li>إذا تغيّرت صلاحيات الصفحة أو أدمنها، اربط الحساب من جديد من "الحسابات المربوطة".</li>
</ul></details>`;
}

function ruleForm(ctx, rule, blocks) {
  const acc = ctx.acc;
  const r = rule || { scope: 'all', on: 'both', match: 'contains', options: {}, status: 'active', keywords: [], publicReplies: [], dm: { items: [] } };
  const o = r.options || {};
  const isNew = !rule;
  const fb = acc.platform === 'facebook';
  const FEAT = { autoLike: 'autoLike', onlyIfLiked: 'likeRequired' };
  const chk = (n, label, hint = '') => {
    const f = FEAT[n];
    const locked = f && !P.can(ctx.tenant, f);
    return `<label class="check"><input type="checkbox" name="opt_${n}" ${o[n] && !locked ? 'checked' : ''} ${locked ? 'disabled' : ''}> ${label}${hint ? ` <span class="muted small">${hint}</span>` : ''}${locked ? lock(ctx, f) : ''}</label>`;
  };
  return layout({ ...ctx, active: 'replies' }, isNew ? 'رد جديد' : 'تعديل رد', `
${pageHead(isNew ? 'رد تلقائي جديد' : 'تعديل الرد')}
<form method="post" action="/a/${acc.id}/replies/${isNew ? 'new' : r.id}" class="card form" data-rule-form>
  <label>اسم الرد</label>
  <input name="title" value="${esc(r.title)}" placeholder="مثلاً: أسعار التصوير" required>

  <label>وين يشتغل</label>
  <div class="seg"><label><input type="radio" name="on" value="comment" ${r.on === 'comment' ? 'checked' : ''}> التعليقات</label>
  <label><input type="radio" name="on" value="both" ${(r.on || 'both') === 'both' ? 'checked' : ''}> التعليقات والدايركت</label>
  <label><input type="radio" name="on" value="dm" ${r.on === 'dm' ? 'checked' : ''}> الدايركت</label></div>

  <fieldset class="box" data-show-when="on!=dm">
    <legend>نطاق الرد</legend>
    <div class="seg"><label><input type="radio" name="scope" value="post" ${r.scope === 'post' ? 'checked' : ''}> منشور واحد</label>
    <label><input type="radio" name="scope" value="all" ${(r.scope || 'all') === 'all' ? 'checked' : ''}> كل المنشورات</label>
    ${fb && P.can(ctx.tenant, 'publish') ? `<label><input type="radio" name="scope" value="newpost" ${r.scope === 'newpost' && !r.postId ? 'checked' : ''}> منشور جديد من شفق</label>` : ''}</div>
    <div data-show-when="scope=post">
      <label>المنشور</label>
      <div class="post-pick" data-post-picker data-acc="${acc.id}">
        <input type="hidden" name="postId" value="${esc(r.postId || '')}">
        <input type="hidden" name="postText" value="${esc(r.postText || '')}">
        <input type="hidden" name="postLink" value="${esc(r.postLink || '')}">
        <div class="post-prev">${r.postId ? esc((r.postText || r.postId).slice(0, 120)) : '<span class="muted">ما اخترت منشور لسا</span>'}</div>
        <button type="button" class="btn dark sm" data-open-posts>اختار منشور</button>
      </div>
    </div>
    ${fb ? `<div data-show-when="scope=newpost">
      <label>نص المنشور الجديد <span class="muted small">(لحد 4000 حرف)</span></label>
      <textarea name="newPostText" rows="4" maxlength="4000" placeholder="نص المنشور"></textarea>
      ${imagePicker('newPostImage', '', 'صورة (اختياري)')}
      <label class="check"><input type="checkbox" name="schedulePost" data-toggle-next> بوقت محدد</label>
      <input type="datetime-local" name="newPostAt">
    </div>` : ''}
  </fieldset>

  <label>كلمات مفتاحية <span class="muted small">(اضغط Enter أو فاصلة لإضافة كلمة)</span></label>
  <div class="chips-input" data-chips data-name="keywords" data-value="${attr(r.keywords || [])}"></div>
  <p class="muted small" data-show-when="on!=dm">بدون كلمات = الرد على أي تعليق.</p>
  <div class="grid2"><div><label>طريقة المطابقة</label><select name="match">
    <option value="contains" ${r.match !== 'exact' ? 'selected' : ''}>الرسالة فيها الكلمة</option>
    <option value="exact" ${r.match === 'exact' ? 'selected' : ''}>الرسالة هي الكلمة بالضبط</option></select></div></div>

  <div data-show-when="on!=dm">
    <div class="row between"><label>الرد العلني <span class="muted small">كل سطر صيغة · {name} = اسم الشخص</span></label>
      <div class="row"><button type="button" class="btn sm" data-gen-replies="publicReplies">اقترح صيغ</button>
      ${P.can(ctx.tenant, 'ai') ? `<button type="button" class="btn dark sm" data-ai-replies="publicReplies" data-acc="${acc.id}">توليد بالذكاء</button>` : ''}</div></div>
    <textarea name="publicReplies" rows="5" placeholder="تكرم {name}، التفاصيل صارت عندك بالخاص&#10;بعتنالك كل شي بالخاص">${esc((r.publicReplies || []).join('\n'))}</textarea>
  </div>

  <label>الرسالة الخاصة</label>
  ${builder('dm', r.dm, blocks, 'على التعليقات بيوصل أول جزء من الرسالة بس (قانون Meta). الأرقام بمفتاح البلد، متل 00963.', !P.can(ctx.tenant, 'richDm'))}

  <fieldset class="box" data-show-when="on!=dm">
    <legend>خيارات متقدمة</legend>
    ${chk('requireMention', 'لازم يعمل منشن لحدا بالتعليق')}
    ${chk('appendReplyToDm', 'حط الرد العلني بأول الرسالة الخاصة', '(بتطلع كل رسالة مختلفة شوي)')}
    ${fb ? chk('autoLike', 'لايك تلقائي على التعليق') : ''}
    ${fb ? chk('onlyIfLiked', 'الرد بس على اللي عامل لايك للمنشور') : ''}
    ${chk('allowRepeat', 'الرد أكتر من مرة على نفس الشخص')}
  </fieldset>

  ${statusField(r)}
  <div class="row form-actions"><button class="btn">حفظ</button><a class="btn danger-btn" href="/a/${acc.id}/replies">إلغاء</a></div>
</form>
<div class="modal" data-posts-modal hidden><div class="modal-card">
  <div class="row between"><h2>اختار منشور</h2><label class="check"><input type="checkbox" data-scheduled> المجدولة</label></div>
  <div data-posts-list class="posts-list"><p class="muted">جاري التحميل...</p></div>
  <button type="button" class="btn danger-btn" data-close-modal>إلغاء</button>
</div></div>`);
}

function dmPage(ctx, blocks) {
  const acc = ctx.acc;
  const d = acc.dmDefault || {};
  return layout({ ...ctx, active: 'dm' }, 'الرد على الرسائل', `
${pageHead('الرد على الرسائل', '', 'رد عام للرسائل والستوري، ورسالة ترحيب')}
<form method="post" action="/a/${acc.id}/dm/default" class="card form">
  <h2>الرد العام على الرسائل والستوري${lock(ctx, 'reelsStory')}</h2>
  <p class="muted small">بيشتغل على أي رسالة أو رد على ستوري ما لقى إله رد تلقائي. فيك تحدده بكلمات، أو تخليه لكل الرسائل.</p>
  <label>كلمات مفتاحية <span class="muted small">(اختياري)</span></label>
  <div class="chips-input" data-chips data-name="keywords" data-value="${attr(d.keywords || [])}"></div>
  <label>الرسالة</label>
  ${builder('message', d.message, blocks, '', !P.can(ctx.tenant, 'richDm'))}
  <label class="check"><input type="checkbox" name="enabled" ${d.enabled ? 'checked' : ''}> تشغيل الرد العام</label>
  <p class="muted small"></p>
  <button class="btn">حفظ</button>
</form>
<form method="post" action="/a/${acc.id}/dm/welcome" class="card form">
  <h2>رسالة الترحيب</h2>
  <p class="muted small">بتنبعت بالدايركت إذا الرسالة ما طابقت ولا رد ولا الرد الافتراضي — مرة وحدة لكل شخص باليوم. بيدعم {name}.</p>
  <textarea name="text" rows="3" placeholder="أهلين {name}، كيف فينا نساعدك؟">${esc(acc.welcome?.text)}</textarea>
  <label class="check"><input type="checkbox" name="enabled" ${acc.welcome?.enabled ? 'checked' : ''}> مفعّلة</label>
  <button class="btn">حفظ</button>
</form>`);
}

module.exports = { repliesPage, ruleForm, dmPage, builder, testBox };
