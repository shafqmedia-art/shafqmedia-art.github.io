// متجر شفق: الإعدادات، الأقسام، المنتجات، الطلبات
const { safeUrl, esc, attr, fmtTime, fmtDate, layout, pageHead, statusField, statusTag, imagePicker, empty, icon } = require('./ui');
const { TEMPLATES, CURRENCIES, money } = require('../lib/store');

const ORDER_STATUS = {
  pending: 'جديد', preparing: 'عم يتجهز', shipping: 'بالطريق', done: 'تم التسليم', cancelled: 'ملغي',
};

function settingsPage(ctx) {
  const acc = ctx.acc;
  const s = acc.store;
  const tplIcons = { shop: icon('store'), services: icon('headset'), restaurant: icon('food'), booking: icon('calendar') };
  const tpls = Object.entries(TEMPLATES).map(([k, t]) => `<label class="pick-card"><input type="radio" name="template" value="${k}" ${s.template === k ? 'checked' : ''}><span>${tplIcons[k]}</span><b>${t.label}</b></label>`).join('');
  const link = acc.platform === 'facebook' ? `https://m.me/${acc.pageId}?ref=store` : `https://ig.me/m/${acc.username}`;
  return layout({ ...ctx, active: 's-settings' }, 'إعدادات المتجر', `
${pageHead('متجر شفق', s.enabled ? '<span class="tag ok">المتجر شغّال</span>' : '<span class="tag">المتجر موقّف</span>')}
<details class="card notes" open><summary><b>وين بيلاقي الزبون المتجر؟</b></summary><ul>
  <li>برابط مباشر فيك تحطه بالبايو أو بالستوري: <a href="${safeUrl(link)}" target="_blank" rel="noopener" dir="ltr" class="ok-text">${esc(link)}</a></li>
  <li>لما يكتب "متجر" أو "شفق" أو "منيو" بالرسائل.</li>
  <li>من زر "ابدأ" أو القائمة الثابتة إذا ربطتهن بالمتجر (من إعدادات المحادثة).</li>
  <li>من أي زر "المتجر" بالردود التلقائية أو الحملات.</li>
</ul></details>
<form method="post" action="/a/${acc.id}/store" class="card form">
  <label>نوع النشاط</label>
  <div class="pick-grid">${tpls}</div>
  <label>أول رسالة بالمتجر</label>
  <textarea name="welcome" rows="2" placeholder="مثلاً: أهلاً فيك، اختار القسم">${esc(s.welcome)}</textarea>
  <label>شكل صور المنتجات</label>
  <div class="pick-grid two">
    <label class="pick-card"><input type="radio" name="imageRatio" value="horizontal" ${s.imageRatio !== 'square' ? 'checked' : ''}><span class="ratio r-wide"></span><b>مستطيل</b></label>
    <label class="pick-card"><input type="radio" name="imageRatio" value="square" ${s.imageRatio === 'square' ? 'checked' : ''}><span class="ratio r-sq"></span><b>مربع</b></label>
  </div>
  <label>اللغة</label>
  <select name="lang"><option value="ar" selected>العربي</option></select>

  <h3><span class="tag warn">التواصل</span></h3>
  <label>العنوان</label><textarea name="address" rows="2" placeholder="المدينة - المنطقة - الشارع">${esc(s.address)}</textarea>
  <div class="grid2">
    <div><label>رقم الموبايل</label><input name="mobile" dir="ltr" value="${esc(s.mobile)}" placeholder="00963..."></div>
    <div><label>رقم الهاتف</label><input name="phone" dir="ltr" value="${esc(s.phone)}" placeholder="أرضي (اختياري)"></div>
  </div>
  <label>رقم الواتساب</label><input name="whatsapp" dir="ltr" value="${esc(s.whatsapp)}" placeholder="00963...">

  <h3><span class="tag warn">الدفع</span></h3>
  <label>العملة</label>
  <select name="currency">${Object.entries({ SYP: 'SYP - Syrian Pound', USD: 'USD - US Dollar', SAR: 'SAR - Saudi Riyal', TRY: 'TRY - Turkish Lira', EUR: 'EUR - Euro', AED: 'AED - UAE Dirham' }).map(([k, l]) => `<option value="${k}" ${s.currency === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
  <label>الدفع بالتحويل؟</label>
  <div class="seg"><label><input type="radio" name="needTransfer" value="1" ${s.needTransfer ? 'checked' : ''}> نعم</label><label><input type="radio" name="needTransfer" value="" ${s.needTransfer ? '' : 'checked'}> لا</label></div>
  <label class="check"><input type="checkbox" name="enabled" ${s.enabled ? 'checked' : ''}> فعّال</label>
  <button class="btn">تعديل</button>
</form>`);
}

function catName(cats, id) {
  return cats.find((c) => c.id === id)?.name || '';
}

function categoriesPage(ctx, cats, q) {
  const acc = ctx.acc;
  const base = `/a/${acc.id}/store/categories`;
  const list = cats.filter((c) => !q || c.name.includes(q));
  const rows = list.map((c) => `<tr>
    <td class="thumb">${c.image ? `<img src="${esc(c.image)}" alt="">` : ''}</td>
    <td><b>${esc(c.name)}</b>${c.parentId ? `<div class="muted small">ضمن ${esc(catName(cats, c.parentId))}</div>` : ''}</td>
    <td>${fmtDate(c.createdAt)}</td>
    <td>${opsCell(base, c)}</td></tr>`).join('');
  return layout({ ...ctx, active: 's-categories' }, 'الأقسام', `
${pageHead('الأقسام', `<a class="btn" href="${base}/new">+ قسم جديد</a>`)}
<form class="search" method="get"><input name="q" value="${esc(q)}" placeholder="بحث"></form>
${list.length ? `<div class="table-wrap"><table data-sortable="${base}/order"><thead><tr><th></th><th>الاسم</th><th>تاريخ الإنشاء</th><th>العمليات</th></tr></thead><tbody>${rows}</tbody></table></div><p class="muted small">اسحب الصفوف لترتيبها بالمتجر.</p>` : empty('ما في أقسام لسا.')}`);
}

function opsCell(base, item, extra = '') {
  return `<div class="ops" data-id="${item.id}">
    <form method="post" action="${base}/${item.id}/toggle"><button class="op ${item.status === 'inactive' ? 'off' : 'on'}" title="إخفاء / إظهار">${icon('power')}</button></form>
    <a class="op" href="${base}/${item.id}" title="تعديل">${icon('edit')}</a>
    ${extra}
    <form method="post" action="${base}/${item.id}/delete" data-confirm="أكيد بدك تحذف؟"><button class="op" title="حذف">${icon('trash')}</button></form>
    <a class="op" href="${base}/${item.id}/stats" title="الإحصائيات">${icon('stats')}</a>
  </div>`;
}

function categoryForm(ctx, cat, cats) {
  const acc = ctx.acc;
  const c = cat || { status: 'active' };
  const parents = cats.filter((x) => x.id !== c.id);
  return layout({ ...ctx, active: 's-categories' }, cat ? 'تعديل القسم' : 'قسم جديد', `
${pageHead(cat ? 'تعديل القسم' : 'قسم جديد')}
<form method="post" action="/a/${acc.id}/store/categories/${cat ? c.id : 'new'}" class="card form">
  <label>اسم القسم</label><input name="name" value="${esc(c.name)}" required>
  <label>ضمن قسم</label>
  <select name="parentId"><option value="">قسم رئيسي</option>${parents.map((p) => `<option value="${p.id}" ${c.parentId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
  <label>سعر ثابت للقسم <span class="muted small">(اختياري — بيتطبّق على المنتجات اللي ما إلها سعر)</span></label>
  <input name="price" type="number" min="0" step="any" value="${esc(c.price || 0)}">
  ${imagePicker('image', c.image, 'صورة القسم')}
  ${statusField(c)}
  <div class="row form-actions"><button class="btn">حفظ</button><a class="btn danger-btn" href="/a/${acc.id}/store/categories">إلغاء</a></div>
</form>`);
}

function productsPage(ctx, products, cats, q) {
  const acc = ctx.acc;
  const base = `/a/${acc.id}/store/products`;
  const list = products.filter((p) => !q || p.name.includes(q));
  const rows = list.map((p) => `<tr>
    <td class="thumb">${p.image ? `<img src="${esc(p.image)}" alt="">` : ''}</td>
    <td><b>${esc(p.name)}</b><div class="muted small">${money(acc, p.price)}</div></td>
    <td>${esc(catName(cats, p.categoryId))}</td>
    <td>${fmtDate(p.createdAt)}</td>
    <td>${opsCell(base, p, `<form method="post" action="${base}/${p.id}/copy"><button class="op" title="نسخ">${icon('copy')}</button></form><a class="op" href="${base}/${p.id}#gallery" title="معرض الصور">${icon('image')}</a>`)}</td></tr>`).join('');
  return layout({ ...ctx, active: 's-products' }, 'المنتجات', `
${pageHead('المنتجات', `<a class="btn" href="${base}/new">+ منتج جديد</a>`)}
<div class="row wrap-gap">
  <a class="btn ghost sm" href="${base}/export.csv">تصدير</a>
  <form method="post" action="${base}/import" enctype="multipart/form-data" class="row"><label class="btn ghost sm file-btn">استيراد<input type="file" name="file" accept=".csv,text/csv" data-autosubmit hidden></label></form>
</div>
<form class="search" method="get"><input name="q" value="${esc(q)}" placeholder="بحث"></form>
${list.length ? `<div class="table-wrap"><table data-sortable="${base}/order"><thead><tr><th></th><th>الاسم</th><th>القسم</th><th>تاريخ الإنشاء</th><th>العمليات</th></tr></thead><tbody>${rows}</tbody></table></div>` : empty(cats.length ? 'ما في منتجات لسا.' : 'ضيف قسم أول، بعدين المنتجات.', cats.length ? '' : `<a class="btn" href="/a/${acc.id}/store/categories/new">+ قسم جديد</a>`)}
<p class="muted small">ملف الاستيراد CSV بالأعمدة: name, category, price, description, image</p>`);
}

function productForm(ctx, prod, cats) {
  const acc = ctx.acc;
  const p = prod || { status: 'active', variants: [], gallery: [] };
  return layout({ ...ctx, active: 's-products' }, prod ? 'تعديل المنتج' : 'منتج جديد', `
${pageHead(prod ? 'تعديل المنتج' : 'إضافة منتج جديد')}
<form method="post" action="/a/${acc.id}/store/products/${prod ? p.id : 'new'}" class="card form">
  <label>القسم</label>
  <select name="categoryId" required><option value="">اختار القسم</option>${cats.map((c) => `<option value="${c.id}" ${p.categoryId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
  <label>اسم المنتج</label><input name="name" value="${esc(p.name)}" required>
  <label>الوصف</label><textarea name="desc" rows="3" maxlength="600">${esc(p.desc)}</textarea>
  <label>سعر المنتج <span class="muted small">(صفر = حسب الطلب)</span></label><input name="price" type="number" min="0" step="any" value="${esc(p.price || 0)}">
  <label>خيارات المنتج <span class="muted small">(قياس، لون... وكل خيار بسعره)</span></label>
  <div class="variants" data-variants data-value="${attr(p.variants || [])}"></div>
  ${imagePicker('image', p.image, 'صورة المنتج')}
  <label id="gallery">صور إضافية <span class="muted small">(بتطلع بصفحة المنتج)</span></label>
  <div class="gallery-pick" data-gallery data-name="gallery" data-value="${attr(p.gallery || [])}"></div>
  ${statusField(p)}
  <div class="row form-actions"><button class="btn">حفظ</button><a class="btn danger-btn" href="/a/${acc.id}/store/products">إلغاء</a></div>
</form>`);
}

function ordersPage(ctx, orders, q) {
  const acc = ctx.acc;
  const base = `/a/${acc.id}/store/orders`;
  const list = orders.filter((o) => !q || `${o.name} ${o.number}`.includes(q));
  const rows = list.map((o) => `<tr><td><b>${esc(o.name)}</b><div class="muted small">#${esc(o.number)}</div></td><td>${fmtTime(o.createdAt)}</td>
    <td><span class="tag st-${o.status}">${ORDER_STATUS[o.status] || o.status}</span></td><td>${money(acc, o.total)}</td>
    <td><div class="ops"><a class="op wide" href="${base}/${o.id}">${icon('info')} التفاصيل</a><form method="post" action="${base}/${o.id}/delete" data-confirm="حذف الطلب؟"><button class="op">${icon('trash')}</button></form></div></td></tr>`).join('');
  return layout({ ...ctx, active: 's-orders' }, 'الطلبات', `
${pageHead('الطلبات', `<a class="btn ghost" href="${base}">تحديث</a>`)}
<form class="search" method="get"><input name="q" value="${esc(q)}" placeholder="بحث بالاسم أو الرقم"></form>
${list.length ? `<div class="table-wrap"><table><thead><tr><th>الاسم</th><th>التاريخ</th><th>الحالة</th><th>المجموع</th><th>العمليات</th></tr></thead><tbody>${rows}</tbody></table></div>` : empty('لسا ما في طلبات. أي طلب بيتأكد بالمتجر بيطلع هون.')}`);
}

function orderPage(ctx, o) {
  const acc = ctx.acc;
  const rows = o.items.map((i) => `<tr><td class="thumb">${i.image ? `<img src="${esc(i.image)}" alt="">` : ''}</td><td>${esc(i.name)}</td><td>${esc(i.type || '')}</td><td>${esc(i.category)}</td><td>${money(acc, i.price)}</td><td>${i.qty}</td><td>${money(acc, i.price * i.qty)}</td></tr>`).join('');
  return layout({ ...ctx, active: 's-orders' }, `طلب #${o.number}`, `
${pageHead(`طلب #${esc(o.number)}`, `<a class="btn ghost" href="/a/${acc.id}/store/orders">رجوع</a>`, esc(o.name))}
<form method="post" action="/a/${acc.id}/store/orders/${o.id}" class="card form">
  <div class="grid2"><div><label>تاريخ الطلب</label><input value="${esc(fmtTime(o.createdAt))}" disabled></div>
  <div><label>الحالة</label><select name="status">${Object.entries(ORDER_STATUS).map(([k, l]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
  <label class="check"><input type="checkbox" name="notify" checked> ابعت للزبون رسالة بالحالة الجديدة</label>
  <label>ملاحظات</label><textarea name="note" rows="2">${esc(o.note)}</textarea>
  <button class="btn">تعديل</button>
</form>
<section class="card"><h2>محتوى الطلب</h2>
<div class="table-wrap"><table><thead><tr><th></th><th>الاسم</th><th>النوع</th><th>القسم</th><th>السعر</th><th>الكمية</th><th>الكلي</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><td colspan="6"><b>المجموع</b></td><td><b>${money(acc, o.total)}</b></td></tr></tfoot></table></div></section>`);
}

function itemStatsPage(ctx, title, rows) {
  return layout({ ...ctx }, 'الإحصائيات', `${pageHead(`${esc(title)}`)}<div class="kpis">${rows.map(([l, n]) => `<div class="kpi"><small>${l}</small><b>${n}</b></div>`).join('')}</div>`);
}

module.exports = { ORDER_STATUS, settingsPage, categoriesPage, categoryForm, productsPage, productForm, ordersPage, orderPage, itemStatsPage, CURRENCIES };
