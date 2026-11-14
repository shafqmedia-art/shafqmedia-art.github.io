// الحسابات والربط، الرئيسية، المستخدمين، التقارير، رفع الملفات، المنشورات
const crypto = require('node:crypto');
const db = require('../lib/db');
const H = require('../lib/http');
const meta = require('../lib/meta');
const core = require('../views/core');
const P = require('../lib/plans');

const configured = () => Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.BASE_URL);

// الصفحات اللي رجعت من فيسبوك، منخليها بالذاكرة لحتى تختار (التوكنات ما بتطلع للمتصفح)
const pending = new Map();

function unsubscribeIfUnused(acc) {
  const stillUsed = db.listAccounts().some((a) => a.id !== acc.id && a.pageId === acc.pageId);
  if (!stillUsed) meta.unsubscribePage(acc.pageId, acc.token).catch((e) => console.error('unsubscribe', e.message));
}

module.exports = (r) => {
  r.get('/', (req, res, { ctx }) => {
    H.redirect(res, ctx.acc ? `/a/${ctx.acc.id}` : '/accounts');
  }, { always: true });

  r.get('/accounts', (req, res, { ctx }) => H.send(res, 200, core.accountsPage(ctx, { configured: configured(), limit: P.pageLimit(ctx.tenant) })));

  r.post('/accounts/:id/toggle', (req, res, { params, query, ctx }) => {
    const acc = ctx.accounts.find((a) => a.id === params.id);
    if (acc) db.updateAccount(acc.id, { enabled: !acc.enabled });
    const back = String(query.back || '/accounts');
    H.redirect(res, back.startsWith('/') && !back.startsWith('//') ? back : '/accounts', acc?.enabled ? 'البوت شغّال' : 'البوت موقّف');
  });

  r.post('/a/:acc/delete', (req, res, { ctx }) => {
    unsubscribeIfUnused(ctx.acc);
    db.deleteAccount(ctx.acc.id);
    H.redirect(res, '/accounts', `انحذف ${ctx.acc.name}.`);
  });

  // ---- ربط حساب (تسجيل الدخول بفيسبوك) ----
  r.get('/connect', (req, res, { ctx }) => {
    if (!configured()) return H.redirect(res, '/accounts', 'لازم تحط إعدادات Meta أول.');
    const state = crypto.randomBytes(16).toString('hex');
    H.addCookie(res, H.cookie('oauth_state', state, { maxAge: 600 }));
    res.writeHead(302, { Location: meta.loginUrl(state) });
    res.end();
  });

  r.get('/oauth/callback', async (req, res, { query, ctx, cookies }) => {
    H.addCookie(res, H.cookie('oauth_state', '', { maxAge: 0 }));
    if (query.error) return H.redirect(res, '/accounts', 'لغيت الربط أو ما وافقت عالصلاحيات.');
    if (!query.state || query.state !== cookies.oauth_state) return H.redirect(res, '/accounts', 'رابط الربط غير صالح، جرّب مرة تانية.');
    try {
      const userToken = await meta.exchangeCode(query.code);
      const pages = await meta.listPages(userToken);
      pending.set(ctx.user.id, { pages, at: Date.now() });
      H.send(res, 200, core.pickPages(ctx, pages));
    } catch (err) {
      console.error('oauth', err.message);
      H.redirect(res, '/accounts', `صار خطأ من فيسبوك: ${err.message}`);
    }
  });

  r.post('/connect/save', async (req, res, { ctx, form }) => {
    const p = pending.get(ctx.user.id);
    if (!p || Date.now() - p.at > 15 * 60e3) return H.redirect(res, '/accounts', 'انتهت مهلة الربط، جرّب مرة تانية.');
    const { fields } = await form();
    const pages = new Map(p.pages.map((x) => [String(x.id), x]));
    const toSubscribe = new Map();
    const tenantId = ctx.tenant.id;
    const limit = P.pageLimit(ctx.tenant);
    const usedPages = new Set(ctx.accounts.map((a) => a.pageId));
    const skipped = [];
    let added = 0;
    let firstId = null;
    for (const pick of [].concat(fields.pick || [])) {
      const [kind, pageId] = String(pick).split(':');
      const page = pages.get(pageId);
      if (!page) continue;
      // الحساب مربوط عند زبون تاني؟
      const owner = db.listAccounts().find((a) => a.pageId === String(page.id) && a.tenantId !== tenantId);
      if (owner) { skipped.push(`${page.name} (مربوطة بحساب تاني)`); continue; }
      if (!usedPages.has(String(page.id)) && usedPages.size >= limit) { skipped.push(`${page.name} (وصلت لحد الصفحات بباقتك)`); continue; }
      let acc;
      if (kind === 'fb') {
        acc = db.upsertAccount({ tenantId, platform: 'facebook', externalId: page.id, name: page.name, username: '', pageId: page.id, token: page.access_token });
      } else if (kind === 'ig' && page.instagram_business_account) {
        if (!P.allowsInstagram(ctx.tenant)) { skipped.push(`إنستغرام ${page.name} (باقتك فيسبوك بس)`); continue; }
        const ig = page.instagram_business_account;
        acc = db.upsertAccount({ tenantId, platform: 'instagram', externalId: ig.id, name: ig.name || ig.username || page.name, username: ig.username || '', pageId: page.id, token: page.access_token });
      } else continue;
      usedPages.add(String(page.id));
      added++;
      firstId ||= acc.id;
      toSubscribe.set(page.id, page.access_token);
    }
    const failed = [];
    for (const [pageId, token] of toSubscribe) {
      try { await meta.subscribePage(pageId, token); } catch (err) {
        console.error('subscribe failed', pageId, err.message);
        failed.push(pages.get(pageId)?.name || pageId);
      }
    }
    pending.delete(ctx.user.id);
    let flash = failed.length ? `انضاف ${added} حساب، بس ما قدرنا نشترك بأحداث: ${failed.join('، ')}. جرّب تربطها مرة تانية.`
      : added ? `انضاف ${added} حساب` : 'ما انضاف ولا حساب.';
    if (skipped.length) flash += ` ما انضاف: ${skipped.join('، ')}.`;
    H.redirect(res, firstId ? `/a/${firstId}` : '/accounts', flash);
  });

  // ---- الرئيسية ----
  r.get('/a/:acc', (req, res, { ctx }) => {
    const id = ctx.acc.id;
    const counts = {
      rules: ctx.acc.rules.length,
      subscribers: db.where('subscribers', (s) => s.accountId === id).length,
      blocks: db.where('blocks', (b) => b.accountId === id).length,
      buttons: db.where('blocks', (b) => b.accountId === id).reduce((n, b) => n + (b.items || []).reduce((m, it) => m + (it.buttons || []).length + (it.cards || []).reduce((k, c) => k + (c.buttons || []).length, 0), 0), 0) + (ctx.acc.messenger?.menu || []).length,
      orders: db.where('orders', (o) => o.accountId === id).length,
      broadcasts: db.where('broadcasts', (b) => (b.accounts || [b.accountId]).includes(id)).length,
    };
    H.send(res, 200, core.homePage(ctx, { counts, days: db.statsRange(id, 14) }));
  });

  r.get('/a/:acc/subscribers', (req, res, { ctx, query }) => {
    const q = String(query.q || '').trim();
    const subs = db.where('subscribers', (s) => s.accountId === ctx.acc.id && (!q || (s.name || '').includes(q)))
      .sort((a, b) => (b.lastMessageAt || b.lastAt) - (a.lastMessageAt || a.lastAt));
    H.send(res, 200, core.subscribersPage(ctx, subs.slice(0, 500), q));
  });

  r.get('/a/:acc/reports', (req, res, { ctx }) => {
    const days = db.statsRange(ctx.acc.id, 14);
    const totals = days.reduce((t, d) => ({ auto: t.auto + d.auto, text: t.text + d.text, clicks: t.clicks + d.clicks, blocks: t.blocks + d.blocks }), { auto: 0, text: 0, clicks: 0, blocks: 0 });
    const logs = db.listLogs(ctx.acc.id);
    const plan = P.effectivePlan(ctx.tenant);
    const detailed = Boolean(plan?.statsDetailed) || P.can(ctx.tenant, 'detailedReports');
    const per = {};
    for (const l of logs) {
      if (l.kind !== 'comment' || !l.postId) continue;
      const x = (per[l.postId] ||= { postId: l.postId, total: 0, replied: 0, filtered: 0, skipped: 0 });
      x.total++;
      if (l.result === 'replied') x.replied++; else if (l.result === 'filtered') x.filtered++; else if (l.result === 'skipped') x.skipped++;
    }
    const orders = db.where('orders', (o) => o.accountId === ctx.acc.id);
    H.send(res, 200, core.reportsPage(ctx, {
      days, totals, logs: logs.slice(0, 100), detailed, canExport: P.can(ctx.tenant, 'detailedReports'),
      perPost: Object.values(per).sort((a, b) => b.total - a.total).slice(0, 50),
      store: P.can(ctx.tenant, 'store') ? { orders: orders.length, total: orders.reduce((n, o) => n + (o.total || 0), 0) } : null,
    }));
  });

  // ---- رفع ملف (صور، فيديو، pdf) ----
  r.post('/upload', async (req, res, { form }) => {
    const { files } = await form();
    if (!files.length) return H.json(res, { error: 'ما في ملف' }, 400);
    try {
      H.json(res, { url: H.saveUpload(db.UPLOADS, files[0]) });
    } catch (err) {
      H.json(res, { error: err.message }, 400);
    }
  });

  // ---- منشورات الحساب (لمنتقي المنشور) ----
  r.get('/a/:acc/posts.json', async (req, res, { ctx, query }) => {
    try {
      const posts = query.scheduled ? await meta.listScheduledPosts(ctx.acc) : await meta.listPosts(ctx.acc);
      H.json(res, { posts });
    } catch (err) {
      H.json(res, { error: err.message, posts: [] }, 200);
    }
  });
};
