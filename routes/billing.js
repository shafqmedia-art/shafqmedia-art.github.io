// الاشتراك: صفحة الباقات، طلب اشتراك بتحويل + إشعار، الكوبونات
const db = require('../lib/db');
const H = require('../lib/http');
const P = require('../lib/plans');
const V = require('../views/billing');

const normCode = (c) => String(c || '').trim().toUpperCase();

// بيرجّع { ok, discount, msg, coupon }
function applyCoupon(code, planId, amount) {
  code = normCode(code);
  if (!code) return { ok: true, discount: 0, msg: '' };
  const c = db.all('coupons').find((x) => normCode(x.code) === code && x.active !== false);
  if (!c) return { ok: false, discount: 0, msg: 'الكوبون مو صحيح' };
  if (c.expiresAt && Date.now() > new Date(c.expiresAt).getTime()) return { ok: false, discount: 0, msg: 'الكوبون منتهي' };
  if (c.maxUses && (c.used || 0) >= c.maxUses) return { ok: false, discount: 0, msg: 'الكوبون خلص' };
  if ((c.plans || []).length && !c.plans.includes(planId)) return { ok: false, discount: 0, msg: 'الكوبون مو لهالباقة' };
  const discount = c.type === 'fixed' ? Math.min(amount, Number(c.value) || 0) : Math.round((amount * (Number(c.value) || 0)) / 100);
  return { ok: true, discount, coupon: c, msg: c.type === 'fixed' ? `خصم ${c.value}` : `خصم ${c.value}%` };
}

module.exports = (r) => {
  r.get('/billing', (req, res, { ctx }) => {
    if (!ctx.tenant || ctx.tenant.house) return H.redirect(res, '/');
    const requests = db.where('requests', (x) => x.tenantId === ctx.tenant.id).sort((a, b) => b.createdAt - a.createdAt);
    const pagesUsed = new Set(ctx.accounts.map((a) => a.pageId)).size;
    H.send(res, 200, V.billingPage(ctx, { plans: P.listPlans(), requests, settings: P.settings(), pagesUsed }));
  }, { always: true });

  r.get('/billing/subscribe', (req, res, { ctx, query }) => {
    if (!ctx.tenant || ctx.tenant.house) return H.redirect(res, '/');
    H.send(res, 200, V.subscribePage(ctx, { plans: P.listPlans(), settings: P.settings(), planId: query.plan }));
  }, { always: true });

  r.get('/billing/coupon.json', (req, res, { query }) => {
    const plan = P.getPlan(query.plan);
    const amount = P.price(plan, query.platforms, query.period);
    const c = applyCoupon(query.code, query.plan, amount);
    H.json(res, { ok: c.ok, msg: c.msg, amount, discount: c.discount, total: Math.max(0, amount - c.discount), percent: c.coupon?.type !== 'fixed' ? Number(c.coupon?.value) || 0 : 0 });
  }, { always: true });

  r.post('/billing/subscribe', async (req, res, { ctx, form }) => {
    const { fields: f } = await form();
    const plan = P.getPlan(f.planId);
    const plans = P.listPlans();
    const back = (error) => H.send(res, 400, V.subscribePage(ctx, { plans, settings: P.settings(), planId: f.planId, coupon: f.coupon, error }));
    if (!plan || plan.active === false) return back('اختار باقة');
    if (!P.PERIODS[f.period] || !P.PLATFORMS[f.platforms]) return back('اختار المدة والمنصات');
    // صورة الإشعار لازم تكون ملف مرفوع على شفق بوت نفسه (مو رابط خارجي أو كود)
    if (f.receipt && !/^\/uploads\/[a-z0-9]+-[a-f0-9]{10}\.(png|jpg|gif|webp|pdf)$/.test(String(f.receipt))) return back('صورة الإشعار مو صالحة، ارفعها من جديد');
    if (!String(f.txn || '').trim() && !f.receipt) return back('دخّل رقم العملية أو ارفع صورة الإشعار');
    if (db.where('requests', (x) => x.tenantId === ctx.tenant.id && x.status === 'pending').length >= 2) return back('عندك طلبات قيد المراجعة، استنى لحتى نراجعها.');
    const amount = P.price(plan, f.platforms, f.period);
    const c = applyCoupon(f.coupon, plan.id, amount);
    if (!c.ok) return back(c.msg);
    db.insert('requests', {
      tenantId: ctx.tenant.id, userId: ctx.user.id, planId: plan.id, period: f.period, platforms: f.platforms,
      coupon: normCode(f.coupon), amount, discount: c.discount, total: Math.max(0, amount - c.discount),
      txn: String(f.txn || '').trim().slice(0, 80), bank: String(f.bank || '').trim().slice(0, 80), receipt: f.receipt || '',
      notes: String(f.notes || '').trim().slice(0, 500), status: 'pending',
    });
    H.redirect(res, '/billing', 'انبعت الطلب رح نراجعه ونفعّل الباقة بأقرب وقت.');
  }, { always: true });
};

module.exports.applyCoupon = applyCoupon;
