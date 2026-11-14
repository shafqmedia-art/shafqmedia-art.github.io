// لوحة المنصة (مدير المنصة بس)
const db = require('../lib/db');
const H = require('../lib/http');
const P = require('../lib/plans');
const V = require('../views/admin');

const opt = { super: true };
const dateMs = (s, endOfDay = true) => (s ? new Date(`${s}T${endOfDay ? '23:59:59' : '00:00:00'}`).getTime() : null);

function enrichRequests(list) {
  return list.map((r) => ({ ...r, tenantName: db.get('tenants', r.tenantId)?.name || '؟' }));
}

function clientTenants() {
  return db.where('tenants', (t) => !t.house).map((t) => {
    const owner = db.get('users', t.ownerId) || db.all('users').find((u) => u.tenantId === t.id);
    return { ...t, ownerUsername: owner?.username || '', accountsCount: db.listAccounts(t.id).length };
  });
}

// تفعيل اشتراك (بعد قبول طلب)
function activate(t, { planId, period, platforms }) {
  const months = P.PERIOD_MONTHS[period] || 1;
  const from = t.expiresAt && t.expiresAt > Date.now() ? t.expiresAt : Date.now();
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  const bonus = P.settings().bonusSecondPage && months >= 3 && planId !== 'lite';
  return db.update('tenants', t.id, { planId, platforms, period, status: 'active', expiresAt: d.getTime(), bonusPage: bonus || Boolean(t.bonusPageGift) });
}

module.exports = (r) => {
  r.get('/admin', (req, res, { ctx }) => {
    const approved = db.where('requests', (x) => x.status === 'approved');
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    H.send(res, 200, V.dashboard(ctx, {
      tenants: db.where('tenants', (t) => !t.house),
      pending: enrichRequests(db.where('requests', (x) => x.status === 'pending')),
      revenue: { all: approved.reduce((n, x) => n + (Number(x.total) || 0), 0), month: approved.filter((x) => (x.reviewedAt || 0) >= monthStart).reduce((n, x) => n + (Number(x.total) || 0), 0) },
      accounts: db.listAccounts().length,
    }));
  }, opt);

  // ---- الزباين ----
  r.get('/admin/tenants', (req, res, { ctx, query }) => {
    const q = String(query.q || '').trim().toLowerCase();
    const st = query.st || '';
    const list = clientTenants()
      .filter((t) => (!q || `${t.name} ${t.phone || ''} ${t.ownerUsername}`.toLowerCase().includes(q)) && (!st || P.status(t) === st))
      .sort((a, b) => b.createdAt - a.createdAt);
    H.send(res, 200, V.tenantsPage(ctx, { tenants: list, q, st }));
  }, opt);

  r.get('/admin/tenants/:id', (req, res, { ctx, params }) => {
    const t = db.get('tenants', params.id);
    if (!t || t.house) return H.redirect(res, '/admin/tenants');
    H.send(res, 200, V.tenantPage(ctx, {
      t, plans: P.listPlans(true),
      users: db.where('users', (u) => u.tenantId === t.id),
      accounts: db.listAccounts(t.id),
      requests: enrichRequests(db.where('requests', (x) => x.tenantId === t.id).sort((a, b) => b.createdAt - a.createdAt)),
    }));
  }, opt);

  r.post('/admin/tenants/:id', async (req, res, { params, form }) => {
    const t = db.get('tenants', params.id);
    if (!t || t.house) return H.redirect(res, '/admin/tenants');
    const { fields: f } = await form();
    db.update('tenants', t.id, {
      planId: P.getPlan(f.planId) ? f.planId : t.planId,
      platforms: P.PLATFORMS[f.platforms] ? f.platforms : t.platforms,
      expiresAt: dateMs(f.expiresAt), trialEndsAt: dateMs(f.trialEndsAt),
      extraPages: Math.max(0, Number(f.extraPages) || 0), aiExtra: Math.max(0, Number(f.aiExtra) || 0),
      bonusPage: f.bonusPage === 'on', bonusPageGift: f.bonusPage === 'on',
      status: f.suspended === 'on' ? 'suspended' : (dateMs(f.expiresAt) ? 'active' : 'trial'),
    });
    H.redirect(res, `/admin/tenants/${t.id}`, 'انحفظ');
  }, opt);

  r.post('/admin/tenants/:id/extend', (req, res, { params, query }) => {
    const t = db.get('tenants', params.id);
    if (!t || t.house) return H.redirect(res, '/admin/tenants');
    const days = Math.min(400, Math.max(1, Number(query.days) || 30));
    const st = P.status(t);
    if (st === 'trial' && !t.expiresAt) db.update('tenants', t.id, { trialEndsAt: Math.max(Date.now(), t.trialEndsAt || 0) + days * 864e5 });
    else db.update('tenants', t.id, { expiresAt: Math.max(Date.now(), t.expiresAt || 0) + days * 864e5, status: t.status === 'suspended' ? 'suspended' : 'active' });
    H.redirect(res, `/admin/tenants/${t.id}`, `انضاف ${days} يوم`);
  }, opt);

  r.post('/admin/tenants/:id/enter', (req, res, { params }) => {
    const t = db.get('tenants', params.id);
    if (!t) return H.redirect(res, '/admin/tenants');
    H.addCookie(res, H.cookie('as', t.id, { maxAge: 3 * 3600 }));
    H.addCookie(res, H.cookie('acc', '', { maxAge: 0 }));
    H.redirect(res, db.listAccounts(t.id)[0] ? `/a/${db.listAccounts(t.id)[0].id}` : '/accounts', `إنت هلق داخل على حساب ${t.name}`);
  }, opt);

  r.post('/admin/exit', (req, res) => {
    H.addCookie(res, H.cookie('as', '', { maxAge: 0 }));
    H.addCookie(res, H.cookie('acc', '', { maxAge: 0 }));
    H.redirect(res, '/admin/tenants');
  }, { super: true, always: true });

  r.post('/admin/tenants/:id/delete', (req, res, { params }) => {
    const t = db.get('tenants', params.id);
    if (!t || t.house) return H.redirect(res, '/admin/tenants');
    for (const a of db.listAccounts(t.id)) db.deleteAccount(a.id);
    db.removeWhere('users', (u) => u.tenantId === t.id);
    db.removeWhere('requests', (x) => x.tenantId === t.id);
    db.remove('tenants', t.id);
    H.redirect(res, '/admin/tenants', `انحذف ${t.name}.`);
  }, opt);

  // ---- الطلبات ----
  r.get('/admin/requests', (req, res, { ctx }) => {
    const list = db.all('requests').slice().sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0) || b.createdAt - a.createdAt);
    H.send(res, 200, V.requestsPage(ctx, enrichRequests(list)));
  }, opt);

  r.post('/admin/requests/:id', async (req, res, { params, form, ctx }) => {
    const rq = db.get('requests', params.id);
    if (!rq || rq.status !== 'pending') return H.redirect(res, '/admin/requests');
    const { fields: f } = await form();
    const t = db.get('tenants', rq.tenantId);
    if (f.action === 'approve' && t) {
      activate(t, rq);
      if (rq.coupon) {
        const c = db.all('coupons').find((x) => x.code.toUpperCase() === rq.coupon);
        if (c) db.update('coupons', c.id, { used: (c.used || 0) + 1 });
      }
      db.update('requests', rq.id, { status: 'approved', note: String(f.note || ''), reviewedAt: Date.now(), reviewedBy: ctx.user.id });
      return H.redirect(res, req.headers.referer?.includes('/admin/tenants') ? `/admin/tenants/${t.id}` : '/admin/requests', `تفعّلت باقة ${t.name}`);
    }
    db.update('requests', rq.id, { status: 'rejected', note: String(f.note || ''), reviewedAt: Date.now(), reviewedBy: ctx.user.id });
    H.redirect(res, '/admin/requests', 'انرفض الطلب.');
  }, opt);

  // ---- الباقات ----
  r.get('/admin/plans', (req, res, { ctx }) => H.send(res, 200, V.plansPage(ctx, P.listPlans(true), P.settings())), opt);

  r.post('/admin/plans', async (req, res, { form }) => {
    const { fields: f } = await form();
    const name = String(f.name || '').trim();
    if (name) db.insert('plans', { name, tagline: '', order: P.listPlans(true).length, pages: 1, aiCredits: 0, features: { unlimitedComments: true }, prices: { fb: {}, fbig: {} }, active: false });
    H.redirect(res, '/admin/plans', 'انضافت باقة (مخفية لحتى تفعّلها).');
  }, opt);

  r.post('/admin/plans/:id', async (req, res, { params, form }) => {
    const p = P.getPlan(params.id);
    if (!p) return H.redirect(res, '/admin/plans');
    const { fields: f } = await form();
    const features = {};
    for (const x of P.FEATURES) features[x.key] = f[`f_${x.key}`] === 'on';
    const prices = { fb: {}, fbig: {} };
    for (const pl of Object.keys(P.PLATFORMS)) for (const per of Object.keys(P.PERIODS)) {
      const v = Number(f[`price_${pl}_${per}`]);
      if (v > 0) prices[pl][per] = v;
    }
    db.update('plans', p.id, {
      name: String(f.name || p.name).trim(), tagline: String(f.tagline || '').trim(),
      pages: Math.max(1, Number(f.pages) || 1), aiCredits: Math.max(0, Number(f.aiCredits) || 0), order: Number(f.order) || 0,
      highlight: f.highlight === 'on', statsDetailed: f.statsDetailed === 'on', active: f.active === 'on', features, prices,
    });
    H.redirect(res, '/admin/plans', `انحفظت ${f.name}`);
  }, opt);

  // ---- الكوبونات ----
  r.get('/admin/coupons', (req, res, { ctx }) => H.send(res, 200, V.couponsPage(ctx, db.all('coupons'), P.listPlans(true))), opt);

  r.post('/admin/coupons', async (req, res, { form }) => {
    const { fields: f } = await form();
    const code = String(f.code || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!code || db.all('coupons').some((c) => c.code.toUpperCase() === code)) return H.redirect(res, '/admin/coupons', 'الكود فاضي أو موجود قبل.');
    db.insert('coupons', { code, type: f.type === 'fixed' ? 'fixed' : 'percent', value: Number(f.value) || 0, maxUses: Number(f.maxUses) || 0, used: 0, expiresAt: f.expiresAt || '', plans: [].concat(f.plans || []), active: true });
    H.redirect(res, '/admin/coupons', `انضاف الكوبون ${code}`);
  }, opt);

  r.post('/admin/coupons/:id/toggle', (req, res, { params }) => {
    const c = db.get('coupons', params.id);
    if (c) db.update('coupons', c.id, { active: c.active === false });
    H.redirect(res, '/admin/coupons');
  }, opt);

  r.post('/admin/coupons/:id/delete', (req, res, { params }) => {
    db.remove('coupons', params.id);
    H.redirect(res, '/admin/coupons', 'انحذف.');
  }, opt);

  // ---- سجل الأمان ----
  r.get('/admin/security', (req, res, { ctx }) => H.send(res, 200, V.securityPage(ctx, P.settings().securityLog || [])), opt);

  // ---- الإعدادات ----
  r.get('/admin/settings', (req, res, { ctx }) => H.send(res, 200, V.settingsPage(ctx, P.settings(), P.listPlans(true))), opt);

  r.post('/admin/settings', async (req, res, { form }) => {
    const { fields: f } = await form();
    const cur = P.settings();
    db.setSettings({
      signupOpen: f.signupOpen === 'on', trialDays: Math.max(0, Number(f.trialDays) || 0), trialPlan: P.getPlan(f.trialPlan) ? f.trialPlan : cur.trialPlan,
      bonusSecondPage: f.bonusSecondPage === 'on', currency: String(f.currency || '').trim().slice(0, 10),
      supportWhatsapp: String(f.supportWhatsapp || '').trim(), paymentInfo: String(f.paymentInfo || '').trim(),
      aiProvider: f.aiProvider === 'openai' ? 'openai' : 'anthropic', aiModel: String(f.aiModel || cur.aiModel).trim(),
      aiKey: String(f.aiKey || '').trim() || cur.aiKey, openaiKey: String(f.openaiKey || '').trim() || cur.openaiKey,
      openaiModel: String(f.openaiModel || cur.openaiModel).trim(), imageModel: String(f.imageModel || cur.imageModel).trim(),
    });
    H.redirect(res, '/admin/settings', 'انحفظت الإعدادات');
  }, opt);
};

module.exports.activate = activate;
