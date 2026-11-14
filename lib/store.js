// متجر شفق داخل الرسائل: أقسام ← منتجات ← سلة ← طلب
const db = require('./db');
const meta = require('./meta');
const { isActive } = require('./rules');
const M = require('./messages');

const TEMPLATES = {
  shop: { label: 'منتجات', add: 'أضف للسلة', cart: 'السلة', checkout: 'تأكيد الطلب', item: 'منتج' },
  services: { label: 'خدمات', add: 'اطلب الخدمة', cart: 'طلباتي', checkout: 'تأكيد الطلب', item: 'خدمة' },
  restaurant: { label: 'مطعم وكافيه', add: 'أضف للطلب', cart: 'طلبي', checkout: 'تأكيد الطلب', item: 'وجبة' },
  booking: { label: 'مواعيد', add: 'احجز', cart: 'حجوزاتي', checkout: 'تأكيد الحجز', item: 'حجز' },
};

const CURRENCIES = { SYP: 'ل.س', USD: '$', SAR: 'ر.س', TRY: '₺', EUR: '€', AED: 'د.إ' };

const STORE_WORDS = ['متجر', 'المتجر', 'شفق', 'تسوق', 'store', 'shop', 'منيو', 'المنيو'];

const tpl = (acc) => TEMPLATES[acc.store?.template] || TEMPLATES.shop;

function money(acc, n) {
  n = Number(n) || 0;
  if (!n) return 'السعر عند الطلب';
  return `${n.toLocaleString('en-US')} ${CURRENCIES[acc.store?.currency] || acc.store?.currency || ''}`.trim();
}

const byOrder = (a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || a.createdAt - b.createdAt;

const activeCats = (acc, parentId = '') =>
  db.where('categories', (c) => c.accountId === acc.id && (c.parentId || '') === parentId && isActive(c)).sort(byOrder);

const activeProducts = (acc, categoryId) =>
  db.where('products', (p) => p.accountId === acc.id && (!categoryId || p.categoryId === categoryId) && isActive(p)).sort(byOrder);

function productPrice(p) {
  if (Number(p.price)) return Number(p.price);
  const cat = db.get('categories', p.categoryId);
  return Number(cat?.price) || 0;
}

async function sendAll(acc, psid, messages) {
  for (const m of messages) await meta.send(acc, { id: psid }, m);
}

const footer = (acc, extra = []) => {
  const t = tpl(acc);
  return { type: 'text', text: 'شو حابب تعمل؟', buttons: [...extra, { title: t.cart, type: 'postback', target: 'CART' }, { title: 'تواصل معنا', type: 'postback', target: 'CONTACT' }].slice(0, 3) };
};

// الصفحة الرئيسية للمتجر
async function home(acc, psid, vars) {
  const s = acc.store;
  const items = [];
  if (s.welcome) items.push({ type: 'text', text: s.welcome, buttons: [] });
  const cats = activeCats(acc);
  if (cats.length) {
    items.push({
      type: 'gallery', ratio: s.imageRatio,
      cards: cats.slice(0, 10).map((c) => ({
        title: c.name, subtitle: Number(c.price) ? `السعر: ${money(acc, c.price)}` : '', image: c.image,
        buttons: [{ title: 'تصفّح', type: 'postback', target: `CAT:${c.id}:0` }],
      })),
    });
  } else {
    items.push(...productCards(acc, activeProducts(acc), 0, 'ALL'));
  }
  items.push(footer(acc));
  await sendAll(acc, psid, M.toMessages(acc, { items }, vars));
  db.stat(acc.id, 'blocks');
}

function productCards(acc, list, page, catKey) {
  const t = tpl(acc);
  if (!list.length) return [{ type: 'text', text: 'ما في شي هون لسا', buttons: [] }];
  const size = 9;
  const slice = list.slice(page * size, page * size + size);
  const cards = slice.map((p) => ({
    title: p.name,
    subtitle: [money(acc, productPrice(p)), p.desc].filter(Boolean).join(' · '),
    image: p.image,
    buttons: [
      { title: t.add, type: 'postback', target: `ADD:${p.id}` },
      { title: 'التفاصيل', type: 'postback', target: `PROD:${p.id}` },
    ],
  }));
  if (list.length > (page + 1) * size) {
    cards.push({ title: 'في كمان', subtitle: `${list.length - (page + 1) * size} ${t.item} تانية`, buttons: [{ title: 'المزيد', type: 'postback', target: `CAT:${catKey}:${page + 1}` }] });
  }
  return [{ type: 'gallery', ratio: acc.store.imageRatio, cards }];
}

async function category(acc, psid, catId, page = 0) {
  const items = [];
  if (catId !== 'ALL') {
    const subs = activeCats(acc, catId);
    if (subs.length && page === 0) {
      items.push({
        type: 'gallery', ratio: acc.store.imageRatio,
        cards: subs.slice(0, 10).map((c) => ({ title: c.name, image: c.image, buttons: [{ title: 'تصفّح', type: 'postback', target: `CAT:${c.id}:0` }] })),
      });
    }
    const prods = activeProducts(acc, catId);
    if (prods.length || !subs.length) items.push(...productCards(acc, prods, page, catId));
  } else {
    items.push(...productCards(acc, activeProducts(acc), page, 'ALL'));
  }
  items.push(footer(acc, [{ title: 'الرئيسية', type: 'store' }]));
  await sendAll(acc, psid, M.toMessages(acc, { items }));
  db.stat(acc.id, 'blocks');
}

async function product(acc, psid, productId) {
  const p = db.get('products', productId);
  if (!p || p.accountId !== acc.id) return;
  const t = tpl(acc);
  const items = [];
  for (const img of [p.image, ...(p.gallery || [])].filter(Boolean).slice(0, 5)) items.push({ type: 'image', url: img });
  const variants = (p.variants || []).filter((v) => v.name);
  const text = `${p.name}\n${money(acc, productPrice(p))}${p.desc ? `\n\n${p.desc}` : ''}`;
  if (variants.length) {
    items.push({ type: 'text', text: `${text}\n\nاختار:`, buttons: [] });
    items.push({
      type: 'gallery', ratio: acc.store.imageRatio,
      cards: variants.slice(0, 10).map((v, i) => ({
        title: v.name, subtitle: money(acc, Number(v.price) || productPrice(p)), image: v.image || p.image,
        buttons: [{ title: t.add, type: 'postback', target: `ADD:${p.id}:${i}` }],
      })),
    });
  } else {
    items.push({ type: 'text', text, buttons: [{ title: t.add, type: 'postback', target: `ADD:${p.id}` }, { title: 'رجوع', type: 'postback', target: `CAT:${p.categoryId || 'ALL'}:0` }, { title: t.cart, type: 'postback', target: 'CART' }] });
  }
  await sendAll(acc, psid, M.toMessages(acc, { items }));
  db.stat(acc.id, 'blocks');
}

function cartLines(acc, cart) {
  let total = 0;
  const lines = cart.map((c) => {
    const p = db.get('products', c.productId);
    if (!p) return null;
    const v = c.variant != null ? (p.variants || [])[c.variant] : null;
    const price = Number(v?.price) || productPrice(p);
    total += price * c.qty;
    const cat = db.get('categories', p.categoryId);
    return { productId: p.id, name: v ? `${p.name} - ${v.name}` : p.name, category: cat?.name || '', type: v?.name || '', price, qty: c.qty, image: p.image };
  }).filter(Boolean);
  return { lines, total };
}

async function add(acc, psid, productId, variant) {
  const p = db.get('products', productId);
  if (!p || p.accountId !== acc.id) return;
  if ((p.variants || []).some((v) => v.name) && variant == null) return product(acc, psid, productId);
  const sub = db.touchSubscriber(acc, psid);
  const v = variant == null ? null : Number(variant);
  const line = sub.cart.find((c) => c.productId === productId && c.variant === v);
  if (line) line.qty += 1; else sub.cart.push({ productId, variant: v, qty: 1 });
  db.saveSoon();
  const t = tpl(acc);
  const count = sub.cart.reduce((n, c) => n + c.qty, 0);
  await sendAll(acc, psid, M.toMessages(acc, { items: [{
    type: 'text', text: `انضاف ${p.name}\nعندك ${count} بـ${t.cart}`,
    buttons: [{ title: t.checkout, type: 'postback', target: 'CHECKOUT' }, { title: t.cart, type: 'postback', target: 'CART' }, { title: 'متابعة التسوق', type: 'store' }],
  }] }));
}

async function cart(acc, psid) {
  const sub = db.touchSubscriber(acc, psid);
  const t = tpl(acc);
  const { lines, total } = cartLines(acc, sub.cart);
  if (!lines.length) {
    return sendAll(acc, psid, M.toMessages(acc, { items: [{ type: 'text', text: `${t.cart} فاضية`, buttons: [{ title: 'تصفّح المتجر', type: 'store' }] }] }));
  }
  const text = `${t.cart}:\n${lines.map((l) => `• ${l.name} × ${l.qty} = ${money(acc, l.price * l.qty)}`).join('\n')}\n\nالمجموع: ${money(acc, total)}`;
  await sendAll(acc, psid, M.toMessages(acc, { items: [{
    type: 'text', text,
    buttons: [{ title: t.checkout, type: 'postback', target: 'CHECKOUT' }, { title: 'تفريغ', type: 'postback', target: 'CLEAR' }, { title: 'متابعة التسوق', type: 'store' }],
  }] }));
}

async function checkout(acc, psid) {
  const sub = db.touchSubscriber(acc, psid);
  const { lines, total } = cartLines(acc, sub.cart);
  if (!lines.length) return cart(acc, psid);
  if (!sub.name) sub.name = await meta.profileName(acc, psid);
  const order = db.insert('orders', {
    accountId: acc.id, subscriberId: sub.id, psid, name: sub.name || 'زبون', items: lines, total, status: 'pending',
    number: String(db.where('orders', (o) => o.accountId === acc.id).length + 1).padStart(4, '0'),
  });
  sub.cart = [];
  db.saveSoon();
  const s = acc.store;
  let text = `تم استلام طلبك\nرقم الطلب: #${order.number}\nالمجموع: ${money(acc, total)}\n\nرح نتواصل معك قريباً`;
  if (s.needTransfer) text += '\n\nالدفع بالتحويل — رح نبعتلك تفاصيل التحويل.';
  const buttons = [];
  if (s.whatsapp) buttons.push({ title: 'واتساب', type: 'whatsapp', target: s.whatsapp, message: `مرحبا، بخصوص طلبي رقم #${order.number}` });
  buttons.push({ title: 'متابعة التسوق', type: 'store' });
  await sendAll(acc, psid, M.toMessages(acc, { items: [{ type: 'text', text, buttons }] }));
  db.log({ accountId: acc.id, kind: 'order', text: `طلب جديد #${order.number} — ${order.name}`, result: 'order' });
}

async function clear(acc, psid) {
  const sub = db.touchSubscriber(acc, psid);
  sub.cart = [];
  db.saveSoon();
  await sendAll(acc, psid, M.toMessages(acc, { items: [{ type: 'text', text: 'فضّينا السلة', buttons: [{ title: 'تصفّح المتجر', type: 'store' }] }] }));
}

async function contact(acc, psid) {
  const s = acc.store;
  const lines = [s.address && `العنوان: ${s.address}`, s.mobile && `موبايل: ${s.mobile}`, s.phone && `هاتف: ${s.phone}`, s.whatsapp && `واتساب: ${s.whatsapp}`].filter(Boolean);
  const buttons = [];
  if (s.mobile) buttons.push({ title: 'اتصال', type: 'call', target: s.mobile });
  if (s.whatsapp) buttons.push({ title: 'واتساب', type: 'whatsapp', target: s.whatsapp });
  buttons.push({ title: 'المتجر', type: 'store' });
  await sendAll(acc, psid, M.toMessages(acc, { items: [{ type: 'text', text: lines.join('\n') || 'تواصل معنا بالرسائل هون', buttons }] }));
}

// موزّع أوامر المتجر — بيرجّع true إذا الأمر للمتجر
async function handlePayload(acc, psid, payload) {
  const [cmd, a, b] = String(payload).split(':');
  switch (cmd) {
    case 'STORE': await home(acc, psid); return true;
    case 'CAT': await category(acc, psid, a, Number(b) || 0); return true;
    case 'PROD': await product(acc, psid, a); return true;
    case 'ADD': await add(acc, psid, a, b === undefined ? undefined : Number(b)); return true;
    case 'CART': await cart(acc, psid); return true;
    case 'CHECKOUT': await checkout(acc, psid); return true;
    case 'CLEAR': await clear(acc, psid); return true;
    case 'CONTACT': await contact(acc, psid); return true;
    default: return false;
  }
}

module.exports = { TEMPLATES, CURRENCIES, STORE_WORDS, money, home, handlePayload, cartLines, productPrice };
