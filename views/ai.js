// شفق AI + فلترة الكلمات + إدارة المحتوى
const { esc, attr, fmtTime, layout, pageHead, imagePicker, empty, icon } = require('./ui');
const P = require('../lib/plans');
const C = require('../lib/content');

const fmt = (n) => (n === Infinity ? 'غير محدود' : Number(n).toLocaleString('en-US'));

function aiTabs(ctx, act) {
  const base = `/a/${ctx.acc.id}/ai`;
  const t = (href, l, k, f) => `<a href="${href}" class="${act === k ? 'on' : ''}">${l}${f && !P.can(ctx.tenant, f) ? ` ${icon('lock', 'ic sm')}` : ''}</a>`;
  return `<div class="tabs">${t(base, 'منشورات وكابشنات', 'caption')}${t(`${base}/replies`, 'ردود التعليقات', 'replies')}${t(`${base}/images`, 'توليد صور', 'images', 'aiImages')}${t(`${base}/assistant`, 'المساعد الذكي', 'assistant', 'aiAssistant')}</div>`;
}

const creditsLine = (ctx, ready) => `<div class="credits"><span>رصيد شفق AI هالشهر:</span> <b dir="ltr">${fmt(P.aiBalance(ctx.tenant))}</b>${ready ? '' : ' <span class="tag bad">الذكاء مو مفعّل على المنصة لسا</span>'}</div>`;

function captionPage(ctx, { ready, results = [], values = {}, error = '' }) {
  const v = { tone: 'حماسي', platform: ctx.acc.platform === 'instagram' ? 'إنستغرام' : 'فيسبوك', length: 'متوسط', count: '3', hashtags: 'on', ...values };
  const sel = (name, opts) => `<select name="${name}">${opts.map((o) => `<option ${String(v[name]) === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
  return layout({ ...ctx, active: 'ai' }, 'شفق AI', `
${pageHead('شفق AI')}${aiTabs(ctx, 'caption')}${creditsLine(ctx, ready)}
${error ? `<div class="flash err">${esc(error)}</div>` : ''}
<form method="post" action="/a/${ctx.acc.id}/ai/caption" class="card form">
  <h2>توليد المنشورات والكابشنات</h2>
  <label>عن شو المنشور؟</label>
  <textarea name="topic" rows="3" required placeholder="مثلاً: عرض تصوير أعراس بالدرون لشهر 12، خصم 20%">${esc(v.topic)}</textarea>
  <div class="grid2"><div><label>الأسلوب</label>${sel('tone', ['حماسي', 'رسمي', 'ودود', 'فكاهي', 'فخم', 'قصصي'])}</div><div><label>المنصة</label>${sel('platform', ['إنستغرام', 'فيسبوك', 'تيك توك'])}</div></div>
  <div class="grid2"><div><label>الطول</label>${sel('length', ['قصير', 'متوسط', 'طويل'])}</div><div><label>عدد النسخ</label>${sel('count', ['1', '2', '3', '4'])}</div></div>
  <label>عن الصفحة <span class="muted small">(اختياري — بيساعد يطلع الكلام أدق)</span></label><input name="brand" value="${esc(v.brand)}" placeholder="مثلاً: شفق ميديا، تصوير وإنتاج بدمشق">
  <label class="check"><input type="checkbox" name="hashtags" ${v.hashtags ? 'checked' : ''}> هاشتاغات</label>
  <label class="check"><input type="checkbox" name="emoji" ${v.emoji ? 'checked' : ''}> إيموجي</label>
  <button class="btn" ${ready ? '' : 'disabled'}>ولّد</button>
</form>
${results.map((r, i) => `<div class="card ai-out"><div class="row between"><b>نسخة ${i + 1}</b><div class="row">
  <button type="button" class="btn ghost sm" data-copy>نسخ</button>
  ${P.can(ctx.tenant, 'publish') ? `<a class="btn sm" href="/a/${ctx.acc.id}/content/new?text=${encodeURIComponent(r)}">انشر / جدول</a>` : ''}</div></div><div class="pre" data-copy-src>${esc(r)}</div></div>`).join('')}`);
}

function repliesPage(ctx, { ready, results = [], context = '', error = '' }) {
  return layout({ ...ctx, active: 'ai' }, 'شفق AI', `
${pageHead('شفق AI')}${aiTabs(ctx, 'replies')}${creditsLine(ctx, ready)}
${error ? `<div class="flash err">${esc(error)}</div>` : ''}
<form method="post" action="/a/${ctx.acc.id}/ai/replies" class="card form">
  <h2>توليد الردود على التعليقات</h2>
  <p class="muted small">صيغ متنوعة للرد العلني تحت التعليقات (حتى ما تنحظر الصفحة من التكرار). فيك كمان تولّدها مباشرة من فورم أي رد تلقائي.</p>
  <label>المنشور أو المنتج <span class="muted small">(اختياري)</span></label>
  <input name="context" value="${esc(context)}" placeholder="مثلاً: باقة تصوير خطوبة">
  <button class="btn" ${ready ? '' : 'disabled'}>ولّد 6 صيغ</button>
</form>
${results.length ? `<div class="card ai-out"><div class="row between"><b>الصيغ</b><button type="button" class="btn ghost sm" data-copy>نسخ الكل</button></div><div class="pre" data-copy-src>${esc(results.join('\n'))}</div>
<p class="muted small">انسخها والصقها بخانة "الرد" بأي قاعدة رد تلقائي — كل سطر صيغة.</p></div>` : ''}`);
}

function imagesPage(ctx, { ready, url = '', prompt = '', error = '' }) {
  return layout({ ...ctx, active: 'ai' }, 'شفق AI', `
${pageHead('شفق AI')}${aiTabs(ctx, 'images')}${creditsLine(ctx, ready)}
${error ? `<div class="flash err">${esc(error)}</div>` : ''}
<form method="post" action="/a/${ctx.acc.id}/ai/images" class="card form">
  <h2>توليد التصاميم والصور</h2>
  <label>وصف الصورة</label>
  <textarea name="prompt" rows="3" required placeholder="مثلاً: بوستر عرض صيفي لمحل إكسسوارات، ألوان ليموني وأسود، ستايل مودرن">${esc(prompt)}</textarea>
  <label>القياس</label><select name="size"><option value="1024x1024">مربع (منشور)</option><option value="1024x1536">طولي (ستوري)</option><option value="1536x1024">عرضي</option></select>
  <p class="muted small">الصورة الوحدة بتاخد 20,000 من الرصيد. بتطلع أحلى إذا كتبت الوصف بالإنكليزي.</p>
  <button class="btn" ${ready ? '' : 'disabled'}>ولّد الصورة</button>
</form>
${url ? `<div class="card ai-out center"><img src="${esc(url)}" alt="" class="ai-img"><div class="row" style="justify-content:center"><a class="btn ghost sm" href="${esc(url)}" download>تنزيل</a>${P.can(ctx.tenant, 'publish') ? `<a class="btn sm" href="/a/${ctx.acc.id}/content/new?media=${encodeURIComponent(url)}">استخدمها بمنشور</a>` : ''}</div></div>` : ''}`);
}

function assistantPage(ctx, { ready, test = '', answer = '', error = '' }) {
  const a = ctx.acc.assistant || {};
  return layout({ ...ctx, active: 'ai' }, 'المساعد الذكي', `
${pageHead('شفق AI')}${aiTabs(ctx, 'assistant')}${creditsLine(ctx, ready)}
${error ? `<div class="flash err">${esc(error)}</div>` : ''}
<form method="post" action="/a/${ctx.acc.id}/ai/assistant" class="card form">
  <h2>مساعد شفق الذكي</h2>
  <p class="muted small">لما توصل رسالة وما تطابق ولا قاعدة، المساعد بيرد على الزبون حسب المعلومات اللي بتكتبها هون. إذا ما عرف الجواب، بيبعت رسالة التحويل للفريق.</p>
  <label>معلومات عن الصفحة</label>
  <textarea name="about" rows="8" placeholder="مثلاً:&#10;- شو منقدم: تصوير أعراس ومناسبات، تصوير درون، إدارة سوشال ميديا&#10;- الأسعار: تصوير عرس من 300$، الدرون من 100$&#10;- العنوان: دمشق - المزة&#10;- الدوام: يومياً من 10 الصبح لـ 8 المسا&#10;- الحجز: على واتساب ...">${esc(a.about)}</textarea>
  <div class="grid2"><div><label>أسلوب الرد</label><input name="tone" value="${esc(a.tone || 'ودود ومختصر')}"></div>
  <div><label>رسالة التحويل للفريق</label><input name="handoff" value="${esc(a.handoff || 'رح يرد عليك حدا من الفريق بأقرب وقت')}"></div></div>
  <label class="check"><input type="checkbox" name="enabled" ${a.enabled ? 'checked' : ''}> تفعيل المساعد الذكي على هالحساب</label>
  <button class="btn">حفظ</button>
</form>
<form method="post" action="/a/${ctx.acc.id}/ai/assistant/test" class="card form">
  <h2>جرّب المساعد</h2>
  <div class="row"><input name="text" value="${esc(test)}" placeholder="اكتب سؤال متل ما بيكتبه زبون..." required style="flex:1"><button class="btn" ${ready ? '' : 'disabled'}>جرّب</button></div>
  ${answer ? `<div class="test-result"><div class="bubble">${esc(answer)}</div></div>` : ''}
</form>`);
}

function badWordsPage(ctx) {
  const b = ctx.acc.badWords || {};
  return layout({ ...ctx, active: 'badwords' }, 'فلترة الكلمات', `
${pageHead('فلترة الكلمات النابية')}
<form method="post" action="/a/${ctx.acc.id}/badwords" class="card form">
  <p class="muted small">أي تعليق فيه وحدة من هالكلمات بينخفى أو بينحذف تلقائياً، والبوت ما بيرد عليه. المطابقة ذكية (أ/إ/آ، ة/ه، والتشكيل).</p>
  <label>الكلمات</label>
  <div class="chips-input" data-chips data-name="words" data-value="${attr(b.words || [])}"></div>
  <label>شو نعمل بالتعليق؟</label>
  <div class="seg"><label><input type="radio" name="action" value="hide" ${b.action !== 'delete' ? 'checked' : ''}> إخفاء (بيضل ظاهر لصاحبه بس)</label>
  ${ctx.acc.platform === 'facebook' ? `<label><input type="radio" name="action" value="delete" ${b.action === 'delete' ? 'checked' : ''}> حذف</label>` : ''}</div>
  <label class="check"><input type="checkbox" name="enabled" ${b.enabled ? 'checked' : ''}> تفعيل الفلترة</label>
  <button class="btn">حفظ</button>
</form>`);
}

// ---------- إدارة المحتوى ----------
function contentPage(ctx, posts) {
  const base = `/a/${ctx.acc.id}/content`;
  const tag = (s) => `<span class="tag ${s === 'published' ? 'ok' : s === 'scheduled' ? 'warn' : s === 'failed' ? 'bad' : ''}">${C.STATUS[s] || s}</span>`;
  const rows = posts.map((p) => `<div class="card post-row">
    ${p.media ? (p.mediaType === 'video' ? `<div class="pthumb">${icon('video')}</div>` : `<img class="pthumb" src="${esc(p.media)}" alt="">`) : `<div class="pthumb">${icon('text')}</div>`}
    <div class="grow"><div class="row between">${tag(p.status)}<span class="muted small">${p.status === 'scheduled' ? `${fmtTime(new Date(p.publishAt).getTime())}` : fmtTime(p.publishedAt || p.createdAt)}</span></div>
    <div class="pre">${esc(String(p.text || '').slice(0, 220))}</div>${p.error ? `<div class="small bad-text">${esc(p.error)}</div>` : ''}</div>
    ${['scheduled', 'failed', 'draft'].includes(p.status) && !p.fbScheduled ? `<div class="ops"><form method="post" action="${base}/${p.id}/delete" data-confirm="حذف المنشور؟"><button class="op">${icon('trash')}</button></form>${p.status === 'failed' ? `<form method="post" action="${base}/${p.id}/retry"><button class="op" title="إعادة المحاولة">↻</button></form>` : ''}</div>` : ''}
  </div>`).join('');
  return layout({ ...ctx, active: 'content' }, 'إدارة المحتوى', `
${pageHead('إدارة المحتوى', `<a class="btn" href="${base}/new">+ منشور جديد</a>`)}
${rows || empty('ما في منشورات من المنصة لسا. اعمل أول منشور، أو جدوله لوقت لاحق.', `<a class="btn" href="${base}/new">+ منشور جديد</a>`)}`);
}

function contentForm(ctx, { text = '', media = '', error = '' }) {
  const ig = ctx.acc.platform === 'instagram';
  return layout({ ...ctx, active: 'content' }, 'منشور جديد', `
${pageHead('منشور جديد', `<a class="btn ghost" href="/a/${ctx.acc.id}/content">رجوع</a>`)}
${error ? `<div class="flash err">${esc(error)}</div>` : ''}
<form method="post" action="/a/${ctx.acc.id}/content/new" class="card form">
  <div class="row between"><label>النص / الكابشن <span class="muted small">(لحد 2200 حرف)</span></label>${P.can(ctx.tenant, 'ai') ? `<a class="btn dark sm" href="/a/${ctx.acc.id}/ai">اكتبه بالذكاء</a>` : ''}</div>
  <textarea name="text" rows="6" maxlength="2200" data-count>${esc(text)}</textarea>
  <label>نوع الوسائط</label>
  <div class="seg"><label><input type="radio" name="mediaType" value="image" checked> صورة</label>${P.can(ctx.tenant, 'reels') ? `<label><input type="radio" name="mediaType" value="video"> فيديو / ريلز</label>` : ''}${ig ? '' : '<label><input type="radio" name="mediaType" value="none"> نص بس</label>'}</div>
  <div data-show-when="mediaType!=none">
    <label>الملف</label>
    <div class="img-pick" data-img-pick data-accept-any>
      <input type="hidden" name="media" value="${esc(media)}">
      <div class="img-prev">${media ? `<img src="${esc(media)}" alt="">` : '<span>＋</span>'}</div>
      <div class="row"><button type="button" class="btn ghost sm" data-upload>رفع</button><button type="button" class="btn ghost sm" data-clear>إزالة</button></div>
    </div>
    <p class="muted small">${ig ? 'إنستغرام: صورة JPG، أو فيديو MP4 للريلز (3 ثواني لـ 15 دقيقة، طولي 9:16).' : 'فيسبوك: صورة أو فيديو MP4.'}</p>
  </div>
  <label>وقت النشر</label>
  <div class="seg"><label><input type="radio" name="when" value="now" checked> انشر هلق</label><label><input type="radio" name="when" value="later"> جدولة</label></div>
  <div data-show-when="when=later"><input type="datetime-local" name="publishAt"><p class="muted small">${ig ? 'شفق بوت بينشره عالوقت تماماً.' : 'فيسبوك بيجدوله لحاله (لازم يكون بعد 10 دقايق على الأقل).'}</p></div>
  <div class="row form-actions"><button class="btn">حفظ</button><a class="btn danger-btn" href="/a/${ctx.acc.id}/content">إلغاء</a></div>
</form>`);
}

module.exports = { captionPage, repliesPage, imagesPage, assistantPage, badWordsPage, contentPage, contentForm };
