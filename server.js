// شفق بوت — السيرفر الرئيسي (Node.js 20+ بدون مكتبات خارجية)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

loadEnvFile(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT) || 3000;
process.env.BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const BASE_URL = process.env.BASE_URL;

const db = require('./lib/db');
const auth = require('./lib/auth');
const H = require('./lib/http');
const meta = require('./lib/meta');
const { parseEvents, handleEvent } = require('./lib/webhook');
const broadcast = require('./lib/broadcast');
const content = require('./lib/content');
const P = require('./lib/plans');
const core = require('./views/core');
const ui = require('./views/ui');

const PUBLIC_DIR = path.join(__dirname, 'public');

if (!process.env.SESSION_SECRET) console.warn(' SESSION_SECRET لازم ينحط قبل ما تستخدم الموقع.');
else if (process.env.SESSION_SECRET.length < 32) console.warn(' SESSION_SECRET قصير: خليه 32 حرف عشوائي أو أكتر.');
if (BASE_URL.startsWith('http://') && !/localhost|127\.0\.0\.1/.test(BASE_URL)) console.warn(' BASE_URL لازم يبلّش بـ https:// على السيرفر الحقيقي.');
P.ensurePlans();
auth.ensureAdmin();

// ---------- قراءة ملف .env (اختياري، للتجربة على الجهاز) ----------
function loadEnvFile(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

// ---------- الراوتر ----------
const router = H.createRouter();
for (const mod of ['auth', 'accounts', 'replies', 'store', 'broadcasts', 'messenger', 'billing', 'admin', 'ai', 'content']) {
  require(`./routes/${mod}`)(router);
}

// منع التخمين على كلمة السر (لكل IP ولكل اسم مستخدم)
const attempts = new Map();
// عنوان الزائر الحقيقي: آخر عنوان أضافه سيرفر الاستضافة (Railway)، مو الأول اللي بيقدر أي حدا يزوّره
const clientIp = (req) => String(req.headers['x-real-ip'] || '').trim()
  || String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean).pop()
  || req.socket.remoteAddress || '';
function tooMany(key, max = 10) {
  const now = Date.now();
  const list = (attempts.get(key) || []).filter((t) => now - t < 15 * 60e3);
  attempts.set(key, list);
  return list.length >= max;
}
const fail = (key) => { if (!attempts.has(key)) attempts.set(key, []); attempts.get(key).push(Date.now()); };

// حد عام للطلبات (يمنع إغراق السيرفر أو تجريب الكوبونات والذكاء الاصطناعي بكثرة)
const buckets = new Map();
const LIMITS = [
  [/^\/upload$/, 'POST', 30, 10 * 60e3],
  [/\/ai(\/|$)/, 'POST', 30, 60e3],
  [/^\/billing\/(coupon\.json|subscribe)/, null, 20, 60e3],
  [/^\/(login|signup)$/, 'POST', 20, 60e3],
  [/./, 'POST', 120, 60e3],
  [/./, null, 600, 60e3],
];
function rateLimited(req, p) {
  const ip = clientIp(req), now = Date.now();
  for (const [re, method, max, win] of LIMITS) {
    if (method && req.method !== method) continue;
    if (!re.test(p)) continue;
    const key = `${ip}|${re}|${method}`;
    const b = buckets.get(key);
    if (!b || now - b.t > win) { buckets.set(key, { t: now, n: 1 }); continue; }
    if (++b.n > max) { if (b.n === max + 1) logSuspicious(req, 'rate-limit', p); return true; }
  }
  return false;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now - b.t > 15 * 60e3) buckets.delete(k); for (const [k, l] of attempts) if (!l.some((t) => now - t < 15 * 60e3)) attempts.delete(k); }, 5 * 60e3).unref();

// سجل النشاط المشبوه (بيبيّن بسجلات Railway ← Deploy Logs، وبينحفظ آخر 500 بقاعدة البيانات لصفحة المنصة)
function logSuspicious(req, kind, detail = '') {
  const entry = { at: Date.now(), kind, ip: clientIp(req), path: String(req.url || '').slice(0, 200), ua: String(req.headers['user-agent'] || '').slice(0, 160), detail: String(detail).slice(0, 200) };
  console.warn('[SECURITY]', JSON.stringify(entry));
  try { const list = (P.settings().securityLog || []).concat(entry).slice(-500); db.setSettings({ securityLog: list }); } catch { /* ignore */ }
}

// حماية CSRF: أي طلب POST لازم يجي من نفس الموقع (إلا Webhook تبع Meta، اللي محمي بالتوقيع)
function sameOrigin(req) {
  const want = new URL(BASE_URL).origin;
  const o = req.headers.origin;
  if (o) return o === want;
  const ref = req.headers.referer;
  if (ref) { try { return new URL(ref).origin === want; } catch { return false; } }
  return false;
}
// تأخير ثابت لما يكون المستخدم مو موجود، حتى ما ينعرف من سرعة الرد إذا الاسم موجود
const DUMMY = { salt: '00'.repeat(16), hash: '00'.repeat(64) };

async function handle(req, res) {
  const url = new URL(req.url, BASE_URL);
  const p = url.pathname;
  const m = req.method;

  // HTTPS إجباري
  if (BASE_URL.startsWith('https://') && req.headers['x-forwarded-proto'] === 'http') {
    res.writeHead(301, { Location: BASE_URL + req.url, ...H.securityHeaders() });
    return res.end();
  }
  if (rateLimited(req, p)) return H.send(res, 429, 'طلبات كتيرة، استنى دقيقة وجرّب.', { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '60' });
  if (m === 'POST' && p !== '/webhook' && !sameOrigin(req)) {
    logSuspicious(req, 'csrf-blocked', req.headers.origin || req.headers.referer || 'no-origin');
    return H.send(res, 403, 'الطلب مرفوض (مصدر غير موثوق).', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  if (!['GET', 'HEAD', 'POST'].includes(m)) return H.send(res, 405, '', { 'Content-Type': 'text/plain' });

  // ---- عام ----
  if (m === 'GET' && p === '/healthz') return H.send(res, 200, 'ok', { 'Content-Type': 'text/plain' });
  if (m === 'GET' && p === '/privacy') return H.send(res, 200, core.privacyPage());
  if (m === 'GET' && p === '/data-deletion') return H.send(res, 200, core.dataDeletionPage());
  if (m === 'GET' && p === '/sw.js') {
    return H.serveFile(req, res, PUBLIC_DIR, 'sw.js', { maxAge: 0 }) || H.send(res, 404, '');
  }
  if ((m === 'GET' || m === 'HEAD') && p.startsWith('/uploads/')) {
    if (H.serveFile(req, res, db.UPLOADS, p.slice(9), { maxAge: 31536000, sandbox: true })) return;
    return H.send(res, 404, '');
  }
  if ((m === 'GET' || m === 'HEAD') && p !== '/' && H.serveFile(req, res, PUBLIC_DIR, p, { maxAge: p.startsWith('/fonts/') || p.startsWith('/icons/') ? 31536000 : 600 })) return;

  // ---- Webhook ----
  if (p === '/webhook') {
    if (m === 'GET') {
      const ok = url.searchParams.get('hub.mode') === 'subscribe' && process.env.META_VERIFY_TOKEN &&
        url.searchParams.get('hub.verify_token') === process.env.META_VERIFY_TOKEN;
      return ok ? H.send(res, 200, url.searchParams.get('hub.challenge') || '', { 'Content-Type': 'text/plain' })
        : H.send(res, 403, 'forbidden', { 'Content-Type': 'text/plain' });
    }
    if (m === 'POST') {
      const raw = await H.readBody(req, 5 * 1024 * 1024);
      if (!meta.verifySignature(raw, req.headers['x-hub-signature-256'])) return logSuspicious(req, 'webhook-bad-signature'), H.send(res, 401, 'bad signature', { 'Content-Type': 'text/plain' });
      H.send(res, 200, 'EVENT_RECEIVED', { 'Content-Type': 'text/plain' }); // Meta بدها رد سريع
      let body;
      try { body = JSON.parse(raw.toString('utf8')); } catch { return; }
      for (const ev of parseEvents(body)) handleEvent(ev).catch((e) => console.error('handleEvent', e));
      return;
    }
  }

  // ---- الدخول ----
  const user = auth.userFromSession(H.parseCookies(req).sid);

  // ---- الصفحات العامة (الموقع التعريفي، الأسعار، التسجيل) ----
  if (await publicRoutes(req, res, { url, user })) return;
  if (p === '/login') {
    if (m === 'GET') return user ? H.redirect(res, '/') : H.send(res, 200, ui.loginPage());
    if (m === 'POST') {
      const ip = clientIp(req);
      const { fields } = await H.readForm(req);
      const uKey = 'u:' + String(fields.username || '').trim().toLowerCase();
      if (tooMany(ip) || tooMany(uKey)) return H.send(res, 429, ui.loginPage('محاولات كتيرة، استنى ربع ساعة وجرّب.'));
      if (!process.env.SESSION_SECRET) return H.send(res, 500, ui.loginPage('السيرفر ناقصه SESSION_SECRET.'));
      if (!db.all('users').length) return H.send(res, 500, ui.loginPage('ما في ولا مستخدم. حط ADMIN_USERNAME و ADMIN_PASSWORD بإعدادات السيرفر وأعد تشغيله.'));
      const u = auth.findUser(fields.username);
      const okPass = auth.checkPassword(u || DUMMY, fields.password || '');
      if (!u || !okPass) {
        fail(ip); fail(uKey);
        logSuspicious(req, 'login-failed', String(fields.username || '').slice(0, 40));
        return H.send(res, 401, ui.loginPage('اسم المستخدم أو كلمة السر غلط.', fields.username));
      }
      attempts.delete(ip); attempts.delete(uKey);
      db.update('users', u.id, { lastLoginAt: Date.now() });
      H.addCookie(res, H.cookie('sid', auth.makeSession(u), { maxAge: auth.SESSION_DAYS * 86400 }));
      return H.redirect(res, '/');
    }
  }
  if (p === '/logout' && m === 'POST') {
    // الجلسة بتنلغى من السيرفر كمان (أي نسخة مسروقة من الكوكي بتبطل تشتغل)
    if (user) db.update('users', user.id, { v: (user.v || 1) + 1 });
    H.addCookie(res, H.cookie('sid', '', { maxAge: 0 }));
    H.addCookie(res, H.cookie('as', '', { maxAge: 0 }));
    return H.redirect(res, '/login');
  }

  if (!user) {
    if (p.endsWith('.json') || req.headers.accept?.includes('application/json')) return H.json(res, { error: 'login' }, 401);
    return H.redirect(res, '/login');
  }

  // ---- الصفحات الداخلية ----
  const found = router.match(m, p);
  // صفحات المنصة (/admin) مقفولة لمدير المنصة بس، حتى لو نسينا نعلّم وحدة منها
  if (p.startsWith('/admin') && user.role !== 'super') { logSuspicious(req, 'admin-denied', user.username); return H.redirect(res, '/', 'هالصفحة لمدير المنصة بس.'); }
  const cookies = H.parseCookies(req);
  let tenant = db.get('tenants', user.tenantId);
  // مدير المنصة فيه يفوت على حساب أي زبون
  if (user.role === 'super' && cookies.as) tenant = db.get('tenants', cookies.as) || tenant;
  const accounts = tenant ? db.listAccounts(tenant.id) : [];
  const ctx = { user, tenant, accounts, flash: '', plan: P.effectivePlan(tenant), impersonating: tenant && tenant.id !== user.tenantId };
  if (!found) return H.send(res, 404, core.notFoundPage(ctx));
  if (found.opts.super && user.role !== 'super') return H.redirect(res, '/', 'هالصفحة لمدير المنصة بس.');
  if (found.opts.admin && !['admin', 'super'].includes(user.role)) return H.redirect(res, '/', 'هالصفحة للمدير بس.');
  // الاشتراك منتهي ← بس صفحة الاشتراك وحسابي
  if (!found.opts.always && !found.opts.super && !P.isLive(tenant)) {
    return H.redirect(res, '/billing', P.status(tenant) === 'suspended' ? 'الحساب موقوف — تواصل معنا.' : 'انتهى الاشتراك أو فترة التجربة. اختار باقة لتكمّل');
  }
  if (found.params.acc) {
    ctx.acc = db.getAccount(found.params.acc);
    if (!ctx.acc || ctx.acc.tenantId !== tenant?.id) return H.redirect(res, '/accounts', 'الحساب مو موجود.');
    const feature = FEATURE_PATHS.find(([re]) => re.test(p))?.[1];
    if (feature && !P.can(tenant, feature)) return H.send(res, 200, require('./views/billing').upgradePage({ ...ctx, active: '' }, feature));
    H.addCookie(res, H.cookie('acc', ctx.acc.id, { maxAge: 365 * 86400 }));
  } else {
    const last = db.getAccount(cookies.acc);
    ctx.acc = last && last.tenantId === tenant?.id ? last : accounts[0] || null; // للقائمة بس
    ctx.navOnly = true;
  }
  if (m === 'GET') ctx.flash = H.takeFlash(req, res);
  let formCache;
  const form = async () => (formCache ||= await H.readForm(req));
  return found.handler(req, res, { params: found.params, query: Object.fromEntries(url.searchParams), ctx, form, cookies });
}

// كل قسم وأي ميزة بالباقة بيحتاج
const FEATURE_PATHS = [
  [/^\/a\/[^/]+\/broadcasts/, 'broadcast'],
  [/^\/a\/[^/]+\/(messenger|blocks)/, 'messengerBot'],
  [/^\/a\/[^/]+\/store/, 'store'],
  [/^\/a\/[^/]+\/reports/, 'stats'],
  [/^\/a\/[^/]+\/content/, 'publish'],
  [/^\/a\/[^/]+\/ai\/images/, 'aiImages'],
  [/^\/a\/[^/]+\/ai\/assistant/, 'aiAssistant'],
  [/^\/a\/[^/]+\/ai/, 'ai'],
  [/^\/a\/[^/]+\/badwords/, 'badWords'],
];

// ---------- الصفحات العامة ----------
async function publicRoutes(req, res, { url, user }) {
  const p = url.pathname;
  const pub = require('./views/public');
  if (req.method === 'GET' && p === '/' && !user) return H.send(res, 200, pub.landingPage({ plans: P.listPlans(), settings: P.settings() })), true;
  if (req.method === 'GET' && p === '/pricing') return H.send(res, 200, pub.pricingPage({ plans: P.listPlans(), settings: P.settings(), user })), true;
  if (p === '/signup') {
    const st = P.settings();
    if (user) return H.redirect(res, '/'), true;
    if (!st.signupOpen) return H.send(res, 200, pub.signupPage({ closed: true, settings: st })), true;
    if (req.method === 'GET') return H.send(res, 200, pub.signupPage({ settings: st })), true;
    if (req.method === 'POST') {
      const ip = clientIp(req);
      if (tooMany('s:' + ip, 5)) return H.send(res, 429, pub.signupPage({ settings: st, error: 'محاولات كتيرة، جرّب بعد شوي.' })), true;
      const { fields: f } = await H.readForm(req);
      fail('s:' + ip);
      try {
        if (!String(f.business || '').trim()) throw new Error('اكتب اسم الصفحة أو النشاط');
        if (f.password !== f.password2) throw new Error('كلمتين السر مو متطابقين');
        if (auth.findUser(f.username)) throw new Error('اسم المستخدم موجود قبل، اختار غيره');
        const tenant = auth.createTenant({ name: f.business, phone: f.phone, trialDays: st.trialDays, planId: st.trialPlan });
        const u = auth.createUser({ username: f.username, password: f.password, name: f.name, phone: f.phone, role: 'admin', tenantId: tenant.id });
        db.update('tenants', tenant.id, { ownerId: u.id });
        H.addCookie(res, H.cookie('sid', auth.makeSession(u), { maxAge: auth.SESSION_DAYS * 86400 }));
        H.redirect(res, '/accounts', `أهلاً فيك بشفق بوت عندك ${st.trialDays} أيام تجربة مجانية. ابدأ بربط صفحتك.`);
      } catch (err) {
        H.send(res, 400, pub.signupPage({ settings: st, error: err.message, values: f }));
      }
      return true;
    }
  }
  return false;
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    // تفاصيل الخطأ بتنكتب بالسجل بس، والزائر بيشوف رسالة عامة (ما منكشف شي عن السيرفر)
    if (!res.headersSent) H.send(res, err.status || 500, err.status === 413 ? 'الطلب كبير كتير' : 'صار خطأ بالسيرفر، جرّب مرة تانية.');
    else res.end();
  });
});

if (require.main === module) {
  broadcast.startScheduler();
  content.startScheduler();
  server.listen(PORT, () => {
    console.log(`شفق بوت شغّال على ${BASE_URL} (port ${PORT})`);
    console.log(`البيانات محفوظة بـ ${db.DATA_DIR}`);
  });
}

module.exports = { server };
