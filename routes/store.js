// متجر شفق: الإعدادات، الأقسام، المنتجات، الطلبات
const db = require('../lib/db');
const H = require('../lib/http');
const meta = require('../lib/meta');
const V = require('../views/store');
const { parseJSON } = require('./replies');

const status = (f) => ({
  status: ['active', 'inactive', 'scheduled'].includes(f.status) ? f.status : 'active',
  from: f.from || '', to: f.to || '',
});
const byOrder = (a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || a.createdAt - b.createdAt;
const mine = (col, acc) => db.where(col, (x) => x.accountId === acc.id).sort(byOrder);

// CSV بسيط
// خلية CSV آمنة: أي نص بيبلّش بـ = + - @ بينحطله ' بالأول حتى ما يشتغل كمعادلة بالإكسل
const csvCell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
function parseCSV(text) {
  const rows = [];
  let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

module.exports = (r) => {
  // ---- الإعدادات ----
  r.get('/a/:acc/store', (req, res, { ctx }) => H.send(res, 200, V.settingsPage(ctx)));
  r.post('/a/:acc/store', async (req, res, { ctx, form }) => {
    const { fields: f } = await form();
    const store = {
      ...ctx.acc.store,
      enabled: f.enabled === 'on', template: f.template || 'shop', welcome: String(f.welcome || '').trim(),
      imageRatio: f.imageRatio === 'square' ? 'square' : 'horizontal', lang: 'ar',
      address: String(f.address || '').trim(), mobile: String(f.mobile || '').trim(), phone: String(f.phone || '').trim(),
      whatsapp: String(f.whatsapp || '').trim(), currency: f.currency || 'SYP', needTransfer: Boolean(f.needTransfer),
    };
    db.updateAccount(ctx.acc.id, { store });
    H.redirect(res, `/a/${ctx.acc.id}/store`, 'انحفظت إعدادات المتجر');
  });

  // ---- عمليات مشتركة للأقسام والمنتجات ----
  for (const [col, path] of [['categories', 'categories'], ['products', 'products']]) {
    const base = (acc) => `/a/${acc.id}/store/${path}`;
    r.post(`/a/:acc/store/${path}/order`, async (req, res, { ctx, form }) => {
      const { fields } = await form();
      const ids = (Array.isArray(fields.ids) ? fields.ids : []).filter((id) => db.get(col, id)?.accountId === ctx.acc.id);
      db.reorder(col, ids);
      H.json(res, { ok: true });
    });
    r.post(`/a/:acc/store/${path}/:id/toggle`, (req, res, { ctx, params }) => {
      const x = db.get(col, params.id);
      if (x?.accountId === ctx.acc.id) db.update(col, x.id, { status: x.status === 'inactive' ? 'active' : 'inactive' });
      H.redirect(res, base(ctx.acc));
    });
    r.post(`/a/:acc/store/${path}/:id/delete`, (req, res, { ctx, params }) => {
      const x = db.get(col, params.id);
      if (x?.accountId === ctx.acc.id) {
        db.remove(col, x.id);
        if (col === 'categories') {
          for (const c of db.where('categories', (y) => y.parentId === x.id)) db.update('categories', c.id, { parentId: '' });
        }
      }
      H.redirect(res, base(ctx.acc), 'انحذف.');
    });
    r.get(`/a/:acc/store/${path}/:id/stats`, (req, res, { ctx, params }) => {
      const x = db.get(col, params.id);
      if (x?.accountId !== ctx.acc.id) return H.redirect(res, base(ctx.acc));
      const orders = db.where('orders', (o) => o.accountId === ctx.acc.id);
      const lines = orders.flatMap((o) => o.items).filter((i) => (col === 'products' ? i.productId === x.id : db.get('products', i.productId)?.categoryId === x.id));
      H.send(res, 200, V.itemStatsPage(ctx, x.name, [
        ['عدد الطلبيات', new Set(orders.filter((o) => o.items.some((i) => lines.includes(i))).map((o) => o.id)).size],
        ['القطع المطلوبة', lines.reduce((n, i) => n + i.qty, 0)],
        ...(col === 'categories' ? [['عدد المنتجات', db.where('products', (p) => p.categoryId === x.id).length]] : []),
      ]));
    });
  }

  // ---- الأقسام ----
  r.get('/a/:acc/store/categories', (req, res, { ctx, query }) => H.send(res, 200, V.categoriesPage(ctx, mine('categories', ctx.acc), String(query.q || '').trim())));
  r.get('/a/:acc/store/categories/new', (req, res, { ctx }) => H.send(res, 200, V.categoryForm(ctx, null, mine('categories', ctx.acc))));
  r.get('/a/:acc/store/categories/:id', (req, res, { ctx, params }) => {
    const c = db.get('categories', params.id);
    if (c?.accountId !== ctx.acc.id) return H.redirect(res, `/a/${ctx.acc.id}/store/categories`);
    H.send(res, 200, V.categoryForm(ctx, c, mine('categories', ctx.acc)));
  });
  r.post('/a/:acc/store/categories/:id', async (req, res, { ctx, params, form }) => {
    const { fields: f } = await form();
    const data = { name: String(f.name || '').trim(), parentId: f.parentId || '', price: Number(f.price) || 0, image: f.image || '', ...status(f) };
    if (data.parentId === params.id) data.parentId = '';
    if (params.id === 'new') db.insert('categories', { accountId: ctx.acc.id, ...data });
    else if (db.get('categories', params.id)?.accountId === ctx.acc.id) db.update('categories', params.id, data);
    H.redirect(res, `/a/${ctx.acc.id}/store/categories`, 'انحفظ القسم');
  });

  // ---- المنتجات ----
  r.get('/a/:acc/store/products', (req, res, { ctx, query }) => H.send(res, 200, V.productsPage(ctx, mine('products', ctx.acc), mine('categories', ctx.acc), String(query.q || '').trim())));
  r.get('/a/:acc/store/products/new', (req, res, { ctx }) => H.send(res, 200, V.productForm(ctx, null, mine('categories', ctx.acc))));

  r.get('/a/:acc/store/products/export.csv', (req, res, { ctx }) => {
    const cats = mine('categories', ctx.acc);
    const rows = [['name', 'category', 'price', 'description', 'image'].join(',')];
    for (const p of mine('products', ctx.acc)) {
      rows.push([p.name, cats.find((c) => c.id === p.categoryId)?.name || '', p.price || 0, p.desc || '', p.image ? require('../lib/messages').absUrl(p.image) : ''].map(csvCell).join(','));
    }
    H.send(res, 200, `﻿${rows.join('\r\n')}`, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="products.csv"' });
  });

  r.post('/a/:acc/store/products/import', async (req, res, { ctx, form }) => {
    const { files } = await form();
    if (!files.length) return H.redirect(res, `/a/${ctx.acc.id}/store/products`, 'ما في ملف.');
    const rows = parseCSV(files[0].data.toString('utf8').replace(/^﻿/, ''));
    const head = (rows.shift() || []).map((h) => h.trim().toLowerCase());
    const col = (row, name) => row[head.indexOf(name)]?.trim() || '';
    let n = 0;
    for (const row of rows) {
      const name = col(row, 'name');
      if (!name) continue;
      const catName = col(row, 'category');
      let cat = catName && db.where('categories', (c) => c.accountId === ctx.acc.id && c.name === catName)[0];
      if (catName && !cat) cat = db.insert('categories', { accountId: ctx.acc.id, name: catName, parentId: '', price: 0, image: '', status: 'active' });
      db.insert('products', { accountId: ctx.acc.id, categoryId: cat?.id || '', name, price: Number(col(row, 'price')) || 0, desc: col(row, 'description'), image: col(row, 'image'), gallery: [], variants: [], status: 'active' });
      n++;
    }
    H.redirect(res, `/a/${ctx.acc.id}/store/products`, `انضاف ${n} منتج`);
  });

  r.get('/a/:acc/store/products/:id', (req, res, { ctx, params }) => {
    const p = db.get('products', params.id);
    if (p?.accountId !== ctx.acc.id) return H.redirect(res, `/a/${ctx.acc.id}/store/products`);
    H.send(res, 200, V.productForm(ctx, p, mine('categories', ctx.acc)));
  });

  r.post('/a/:acc/store/products/:id/copy', (req, res, { ctx, params }) => {
    const p = db.get('products', params.id);
    if (p?.accountId === ctx.acc.id) {
      const { id, createdAt, updatedAt, ...rest } = structuredClone(p);
      db.insert('products', { ...rest, name: `${p.name} (نسخة)` });
    }
    H.redirect(res, `/a/${ctx.acc.id}/store/products`, 'انعملت نسخة.');
  });

  r.post('/a/:acc/store/products/:id', async (req, res, { ctx, params, form }) => {
    const { fields: f } = await form();
    const variants = parseJSON(f.variants, []).filter((v) => v && v.name).map((v) => ({ name: String(v.name).slice(0, 60), price: Number(v.price) || 0 }));
    const gallery = parseJSON(f.gallery, []).filter((x) => typeof x === 'string' && x).slice(0, 9);
    const data = {
      categoryId: f.categoryId || '', name: String(f.name || '').trim(), desc: String(f.desc || '').trim(),
      price: Number(f.price) || 0, image: f.image || '', gallery, variants, ...status(f),
    };
    if (params.id === 'new') db.insert('products', { accountId: ctx.acc.id, ...data });
    else if (db.get('products', params.id)?.accountId === ctx.acc.id) db.update('products', params.id, data);
    H.redirect(res, `/a/${ctx.acc.id}/store/products`, 'انحفظ المنتج');
  });

  // ---- الطلبيات ----
  r.get('/a/:acc/store/orders', (req, res, { ctx, query }) => {
    const orders = db.where('orders', (o) => o.accountId === ctx.acc.id).sort((a, b) => b.createdAt - a.createdAt);
    H.send(res, 200, V.ordersPage(ctx, orders, String(query.q || '').trim()));
  });
  r.get('/a/:acc/store/orders/:id', (req, res, { ctx, params }) => {
    const o = db.get('orders', params.id);
    if (o?.accountId !== ctx.acc.id) return H.redirect(res, `/a/${ctx.acc.id}/store/orders`);
    H.send(res, 200, V.orderPage(ctx, o));
  });
  r.post('/a/:acc/store/orders/:id', async (req, res, { ctx, params, form }) => {
    const o = db.get('orders', params.id);
    if (o?.accountId !== ctx.acc.id) return H.redirect(res, `/a/${ctx.acc.id}/store/orders`);
    const { fields: f } = await form();
    const changed = f.status && f.status !== o.status && V.ORDER_STATUS[f.status];
    db.update('orders', o.id, { status: V.ORDER_STATUS[f.status] ? f.status : o.status, note: String(f.note || '') });
    let flash = 'انحفظ الطلب';
    if (changed && f.notify === 'on') {
      try {
        await meta.send(ctx.acc, { id: o.psid }, { text: `تحديث على طلبك #${o.number}: ${V.ORDER_STATUS[f.status]}` }, { tag: 'POST_PURCHASE_UPDATE' });
        flash += ' وانبعت للزبون رسالة.';
      } catch (err) {
        flash += ` (ما قدرنا نبعت للزبون: ${err.message})`;
      }
    }
    H.redirect(res, `/a/${ctx.acc.id}/store/orders/${o.id}`, flash);
  });
  r.post('/a/:acc/store/orders/:id/delete', (req, res, { ctx, params }) => {
    if (db.get('orders', params.id)?.accountId === ctx.acc.id) db.remove('orders', params.id);
    H.redirect(res, `/a/${ctx.acc.id}/store/orders`, 'انحذف الطلب.');
  });
};
