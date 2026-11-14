// بوت المحادثة: إعدادات المحادثة (ترحيب، زر "ابدأ"، القائمة) + إدارة الوحدات
const { esc, attr, layout, pageHead, empty, icon } = require('./ui');

function settingsPage(ctx, { blocks, tab }) {
  const acc = ctx.acc;
  const m = acc.messenger || {};
  const base = `/a/${acc.id}/messenger`;
  const fb = acc.platform === 'facebook';
  const targetOptions = (cur) => `<option value="">اختار خطوة</option>
    ${acc.store?.enabled ? `<option value="STORE" ${cur === 'STORE' ? 'selected' : ''}>المتجر</option>` : ''}
    ${blocks.map((b) => `<option value="${b.id}" ${cur === b.id ? 'selected' : ''}>${esc(b.groupName ? `${b.groupName} › ` : '')}${esc(b.name)}</option>`).join('')}`;
  const t = tab || 'greeting';
  const tabLink = (k, label) => `<a href="${base}?tab=${k}" class="${t === k ? 'on' : ''}">${label}</a>`;

  const menuRows = (m.menu || []).map((it, i) => `
    <form method="post" action="${base}/menu/${i}" class="menu-row">
      <input name="title" value="${esc(it.title)}" maxlength="20" required>
      <select name="type" data-menu-type><option value="block" ${it.type !== 'url' ? 'selected' : ''}>خطوة من مسار</option><option value="url" ${it.type === 'url' ? 'selected' : ''}>رابط</option></select>
      <select name="target" data-for="block">${targetOptions(it.type !== 'url' ? it.target : '')}</select>
      <input name="url" data-for="url" dir="ltr" placeholder="https://" value="${it.type === 'url' ? esc(it.target) : ''}">
      <div class="row"><button class="btn sm"></button><button class="btn danger-btn sm" formaction="${base}/menu/${i}/delete" formnovalidate>${icon('trash')}</button></div>
    </form>`).join('');

  return layout({ ...ctx, active: 'm-settings' }, 'إعدادات المحادثة', `
${pageHead('إعدادات المحادثة')}
<div class="tabs">${fb ? tabLink('greeting', 'رسالة الترحيب') + tabLink('start', 'زر "ابدأ"') : ''}${tabLink('menu', 'القائمة الثابتة')}</div>
${t === 'greeting' && fb ? `
<form method="post" action="${base}/greeting" class="card form">
  <div class="note-box"><b>ملاحظة:</b> هالرسالة بتظهر للمستخدم أول مرة بيفتح فيها محادثة مع الصفحة، قبل ما يبعت أي شي.</div>
  <label>نص رسالة الترحيب <span class="muted small">(لحد 160 حرف · بيدعم {{user_first_name}})</span></label>
  <textarea name="greeting" rows="3" maxlength="160" data-count>${esc(m.greeting)}</textarea>
  <button class="btn">تعديل</button>
</form>` : ''}
${t === 'start' && fb ? `
<form method="post" action="${base}/start" class="card form">
  <div class="note-box"><b>ملاحظة:</b> أول شي بيشوفه الزبون لما يكبس "ابدأ" — اربطه بخطوة ترحيب واضحة.</div>
  <label>زر "ابدأ" بيفتح</label>
  <select name="getStartedBlock">${targetOptions(m.getStartedBlock)}</select>
  <button class="btn">تعديل</button>
</form>` : ''}
${t === 'menu' || !fb ? `
<section class="card">
  <div class="row between"><h2>القائمة الثابتة</h2>
    <form method="post" action="${base}/publish"><button class="btn dark">تحديث القائمة</button></form></div>
  <p class="muted small">أزرار بتضل ظاهرة جنب مربع الكتابة عند الزبون (لحد 20). بعد أي تعديل اكبس <b>تحديث القائمة</b>.</p>
  ${menuRows || '<p class="muted">ما في أزرار لسا.</p>'}
  <form method="post" action="${base}/menu" class="menu-row new">
    <input name="title" maxlength="20" placeholder="اسم الزر (متل: خدماتنا)" required>
    <select name="type" data-menu-type><option value="block">خطوة من مسار</option><option value="url">رابط</option></select>
    <select name="target" data-for="block">${targetOptions('')}</select>
    <input name="url" data-for="url" dir="ltr" placeholder="https://">
    <button class="btn sm">+ زر</button>
  </form>
</section>` : ''}
${m.publishedAt ? `<p class="muted small">آخر نشر: ${new Date(m.publishedAt).toLocaleString('ar-SY', { timeZone: 'Asia/Damascus' })}</p>` : ''}`);
}

function blocksPage(ctx, { groups, blocks, current }) {
  const acc = ctx.acc;
  const base = `/a/${acc.id}/blocks`;
  const allBlocks = blocks.map((b) => ({ id: b.id, name: b.name }));
  const groupHtml = groups.map((g) => {
    const gb = blocks.filter((b) => b.groupId === g.id);
    return `<details class="group" open>
      <summary><form method="post" action="${base}/groups/${g.id}" class="inline-edit"><input name="name" value="${esc(g.name)}" aria-label="اسم المسار"><button class="op" title="حفظ الاسم">✓</button></form>
        <span class="row"><form method="post" action="${base}/groups/${g.id}/copy"><button class="op" title="نسخ">${icon('copy')}</button></form>
        <form method="post" action="${base}/groups/${g.id}/delete" data-confirm="رح ينحذف المسار وكل خطواته. متأكد؟"><button class="op" title="حذف">${icon('trash')}</button></form></span></summary>
      ${gb.map((b) => `<a class="block-btn ${current?.id === b.id ? 'on' : ''}" href="${base}?b=${b.id}">${esc(b.name)}</a>`).join('')}
      <form method="post" action="${base}/groups/${g.id}/blocks"><button class="block-add" title="خطوة جديدة">+</button></form>
    </details>`;
  }).join('');

  const editor = current ? `
<section class="card block-editor">
  <form method="post" action="${base}/${current.id}" data-block-form>
    <div class="row between">
      <input class="title-input" name="name" value="${esc(current.name)}" aria-label="اسم الخطوة" required>
      <div class="row">
        <select name="groupId" aria-label="المجموعة" title="نقل لمسار">${groups.map((g) => `<option value="${g.id}" ${g.id === current.groupId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>
        <button class="op" formaction="${base}/${current.id}/copy" title="نسخ">${icon('copy')}</button>
        <button class="op" formaction="${base}/${current.id}/delete" data-confirm="حذف الخطوة؟" title="حذف">${icon('trash')}</button>
      </div>
    </div>
    <div class="mb" data-builder data-name="items" data-items-only data-value="${attr({ items: current.items || [] })}" data-blocks="${attr(allBlocks)}"></div>
    <div class="row form-actions"><button class="btn">حفظ الخطوة</button><span class="muted small">بعد الحفظ بيطلع "تم الحفظ"</span></div>
  </form>
</section>` : (blocks.length ? '<p class="muted center">اختار خطوة من فوق لتعدّلها.</p>' : '');

  return layout({ ...ctx, active: 'm-blocks' }, 'مسارات المحادثة', `
${pageHead('مسارات المحادثة')}
<section class="card groups">
  ${groupHtml || '<p class="muted">ابدأ بأول مسار، وسمّيه حسب هدفه (متل: الترحيب، الخدمات، الحجز).</p>'}
  <form method="post" action="${base}/groups"><button class="btn wide">مسار جديد</button></form>
</section>
${editor}
<details class="card notes"><summary><b>شلون بتشتغل المسارات؟</b></summary><ol class="steps">
  <li>المسار هو مجموعة خطوات مرتبة (متل: الترحيب، الخدمات، الحجز).</li>
  <li>كل خطوة هي رسالة: نص، صور، معرض كروت، فيديو أو ملف — وتحتها أزرار.</li>
  <li>الأزرار بتنقل الزبون لخطوة تانية، أو بتفتح رابط، اتصال، واتساب، أو المتجر.</li>
  <li>من <b>إعدادات المحادثة</b> اربط زر "ابدأ" والقائمة الثابتة بأول خطوة.</li>
</ol></details>`);
}

module.exports = { settingsPage, blocksPage };
