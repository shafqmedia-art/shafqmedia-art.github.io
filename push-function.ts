// شفق ميديا · دالة الإشعارات (Supabase Edge Function اسمها push)
// تبعت إشعارات الجوال: الأحداث (مهمة، دفعة، منشور) + تحيات الصبح والمسا + تنبيه المنشور المتأخر.
// المفاتيح السرية تنقرأ من Secrets: VAPID_PUBLIC و VAPID_PRIVATE و VAPID_SUBJECT.

const env = (k) => String((globalThis.Deno ? Deno.env.get(k) : process.env[k]) || '').trim();
const SB = env('SUPABASE_URL'), SK = env('SUPABASE_SERVICE_ROLE_KEY');
const enc = new TextEncoder();
const ORIGINS = (env('ALLOWED_ORIGINS') || 'https://shafqmedia.com,https://shafqmedia-art.github.io').split(',').map((x) => x.trim()).filter(Boolean);
const corsFor = (req) => { const o = req.headers.get('origin') || ''; return { 'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0], 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }; };
const DOMAIN = env('LOGIN_DOMAIN') || 'shafq.art';

/* ---------- ترميز ---------- */
const b64u = (buf) => { let s = ''; new Uint8Array(buf).forEach((c) => (s += String.fromCharCode(c))); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const ub64 = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s), o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; };
const cat = (...a) => { const n = a.reduce((x, y) => x + y.length, 0), o = new Uint8Array(n); let p = 0; a.forEach((x) => { o.set(x, p); p += x.length; }); return o; };
const hkdf = async (salt, ikm, info, len) => new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), len * 8));

/* ---------- VAPID (RFC 8292) ---------- */
let vapidKey = null;
async function vapidHeader(endpoint) {
  const pub = ub64(env('VAPID_PUBLIC'));
  if (!vapidKey) vapidKey = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), d: env('VAPID_PRIVATE'), ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const u = new URL(endpoint);
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud: u.origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env('VAPID_SUBJECT') || 'https://shafqmedia-art.github.io' })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, vapidKey, enc.encode(head + '.' + body));
  return 'vapid t=' + head + '.' + body + '.' + b64u(sig) + ', k=' + env('VAPID_PUBLIC');
}

/* ---------- تشفير الرسالة (RFC 8291, aes128gcm) ---------- */
async function encrypt(text, p256dh, auth, fixed) {
  const ua = ub64(p256dh), secret = ub64(auth);
  const as = fixed ? fixed.keys : await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(secret, shared, cat(enc.encode('WebPush: info\0'), ua, asPub), 32);
  const salt = fixed ? fixed.salt : crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(enc.encode(text), new Uint8Array([2]))));
  return cat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([65]), asPub, ct);
}

async function sendOne(sub, msg) {
  const body = await encrypt(JSON.stringify(msg), sub.p256dh, sub.auth);
  const r = await fetch(sub.endpoint, { method: 'POST', headers: { Authorization: await vapidHeader(sub.endpoint), TTL: '86400', Urgency: 'high', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream' }, body });
  if (r.status >= 300) { const t = await r.text().catch(() => ''); console.log('push', r.status, new URL(sub.endpoint).host, t.slice(0, 200)); if (r.status !== 404 && r.status !== 410) throw new Error(new URL(sub.endpoint).host + ' ' + r.status + ' ' + t.slice(0, 80)); }
  if (r.status === 404 || r.status === 410) await db('DELETE', 'push_subs?endpoint=eq.' + encodeURIComponent(sub.endpoint));
  return r.status;
}

/* ---------- قاعدة البيانات بمفتاح الخدمة ---------- */
async function db(method, path, body, prefer) {
  const r = await fetch(SB + '/rest/v1/' + path, { method, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json', Prefer: prefer || 'return=minimal' }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error('db ' + r.status + ' ' + (await r.text()));
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
const lastErr = [];
async function sendTo(userIds, msg) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return 0;
  const subs = await db('GET', 'push_subs?select=endpoint,p256dh,auth,user_id&user_id=in.(' + ids.join(',') + ')');
  sendTo.subs = (sendTo.subs || 0) + subs.length;
  const res = await Promise.allSettled(subs.map((s) => sendOne(s, msg)));
  res.forEach((x) => { if (x.status === 'rejected') lastErr.push(String(x.reason && x.reason.message || x.reason).slice(0, 120)); else if (x.value >= 300) lastErr.push('push ' + x.value); });
  return res.filter((x) => x.status === 'fulfilled' && x.value < 300).length;
}

/* ---------- نصوص عربية ---------- */
const count = (n, one, two, few, many) => (n === 1 ? one : n === 2 ? two : n <= 10 ? n + ' ' + few : n + ' ' + many);
const tasksAr = (n) => count(n, 'مهمة وحدة', 'مهمتين', 'مهام', 'مهمة');
const postsAr = (n) => count(n, 'منشور واحد', 'منشورين', 'منشورات', 'منشور');
const sir = (p) => (p.gender === 'f' ? 'أستاذة ' : 'أستاذ ') + (p.name || '');
function damascus(d) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Damascus', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const g = (t) => f.find((x) => x.type === t).value;
  return { day: g('year') + '-' + g('month') + '-' + g('day'), hour: +g('hour'), stamp: g('year') + '-' + g('month') + '-' + g('day') + 'T' + g('hour') + ':' + g('minute') };
}

/* ---------- التشغيل كل ساعة: تحيات + منشورات متأخرة ---------- */
async function cron(now) {
  const t = damascus(now || new Date());
  const [profiles, tasks, posts, clients, st] = await Promise.all([
    db('GET', 'profiles?select=id,name,role,gender,client_id,active'),
    db('GET', 'tasks?select=id,title,user_id,due,done,done_at'),
    db('GET', "items?select=id,status,data&kind=eq.post"),
    db('GET', 'clients?select=id,name'),
    db('GET', 'settings?select=key,value&key=in.(push_state,push_hours)'),
  ]);
  const set = {}; st.forEach((r) => (set[r.key] = r.value));
  const hours = Object.assign({ morning: 8, evening: 21 }, set.push_hours || {}), state = Object.assign({}, set.push_state || {});
  const live = profiles.filter((p) => p.active !== false), mgrs = live.filter((p) => p.role === 'manager');
  const cname = (id) => (clients.find((c) => c.id === id) || {}).name || '';
  const P = posts.map((x) => Object.assign({ id: x.id, status: x.status }, x.data || {}));
  const out = { morning: 0, evening: 0, late: 0 };

  for (const part of ['morning', 'evening']) {
    const h = hours[part];
    if (t.hour < h || t.hour > h + 2 || state[part] === t.day) continue;
    const m = part === 'morning', hi = m ? 'صباح الخير ' : 'مساء الخير ', em = m ? ' ☀️' : ' 🌙';
    const jobs = live.map((p) => {
      let body;
      if (p.role === 'client') {
        const n = P.filter((x) => x.client_id === p.client_id && x.date === t.day && (m || x.status === 'منشور')).length;
        body = m ? (n ? 'عنا اليوم ' + postsAr(n) + ' إلكم. يومكم سعيد' : 'نتمنالكم يوم حلو. فريق شفق معكم') : (n ? 'نزل اليوم ' + postsAr(n) + ' إلكم. يعطيكم العافية' : 'يعطيكم العافية، تصبحوا على خير');
      } else if (p.role === 'manager') {
        const due = tasks.filter((x) => !x.done && x.due <= t.day).length, done = tasks.filter((x) => x.done && x.done_at === t.day).length, pp = P.filter((x) => x.date === t.day).length;
        body = m ? 'اليوم: ' + tasksAr(due) + ' مفتوحة للفريق · ' + postsAr(pp) + ' بخطة النشر' : 'الفريق أنجز اليوم ' + tasksAr(done) + (due ? ' · باقي ' + tasksAr(due) : '');
      } else {
        const mine = tasks.filter((x) => x.user_id === p.id), open = mine.filter((x) => !x.done && x.due <= t.day).length, late = mine.filter((x) => !x.done && x.due < t.day).length, done = mine.filter((x) => x.done && x.done_at === t.day).length;
        const f = p.gender === 'f';
        body = m ? (open ? (f ? 'عندكِ' : 'عندك') + ' اليوم ' + tasksAr(open) + (late ? ' · منها متأخر ' + late : '') : (f ? 'ما عندكِ' : 'ما عندك') + ' مهام اليوم. يومك سعيد') : (done ? (f ? 'أنجزتِ' : 'أنجزت') + ' اليوم ' + tasksAr(done) + '. ' : '') + (f ? 'يعطيكِ العافية' : 'يعطيك العافية');
      }
      return sendTo([p.id], { title: hi + sir(p) + em, body, tag: part, url: './' });
    });
    out[part] = (await Promise.all(jobs)).reduce((a, b) => a + b, 0);
    state[part] = t.day;
  }

  // المنشورات المتأخرة (آخر 7 أيام فقط، مرة وحدة لكل منشور) تروح للمدير والمسؤول، مو للعميل
  const week = new Date(Date.parse(t.day + 'T00:00:00Z') - 7 * 864e5).toISOString().slice(0, 10);
  for (const x of P) {
    if (x.status === 'منشور' || x.late_sent || !x.date || x.date < week) continue;
    if ((x.date + 'T' + (x.time || '23:59')) >= t.stamp) continue;
    await sendTo(mgrs.map((p) => p.id).concat([x.owner]), { title: 'منشور متأخر ⏰', body: '«' + (x.name || '') + '»' + (cname(x.client_id) ? ' لـ ' + cname(x.client_id) : '') + ' كان موعده ' + x.date + (x.time ? ' الساعة ' + x.time : ''), tag: 'late-' + x.id, url: './#/m/content' });
    const data = Object.assign({}, posts.find((y) => y.id === x.id).data, { late_sent: true });
    await db('PATCH', 'items?id=eq.' + x.id, { data });
    out.late++;
  }
  await db('POST', 'settings?on_conflict=key', { key: 'push_state', value: state }, 'resolution=merge-duplicates,return=minimal');
  return out;
}

/* ---------- مين عم يطلب؟ (تحقق من الجلسة على السيرفر) ---------- */
async function caller(req) {
  const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!tok || tok.split('.').length !== 3) return null;
  const ur = await fetch(SB + '/auth/v1/user', { headers: { apikey: SK, Authorization: 'Bearer ' + tok } });
  if (!ur.ok) return null;
  const me = await ur.json();
  const [prof] = await db('GET', 'profiles?select=id,role,active&id=eq.' + me.id);
  return prof && prof.active !== false ? prof : null;
}

/* ---------- المدير بينشئ حساب عضو أو عميل (بدل التسجيل المفتوح) ---------- */
async function createUser(req, phone, pass) {
  const prof = await caller(req);
  if (!prof || prof.role !== 'manager') return { status: 403, error: 'مسموح للمدير بس' };
  const d = String(phone || '').replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632)).replace(/\D/g, '');
  if (d.length < 8 || d.length > 15) return { status: 400, error: 'رقم الموبايل غير صحيح' };
  if (String(pass || '').length < 8 || String(pass).length > 72) return { status: 400, error: 'كلمة السر 8 أحرف على الأقل' };
  const r = await fetch(SB + '/auth/v1/admin/users', { method: 'POST', headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: d + '@' + DOMAIN, password: String(pass), email_confirm: true }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { status: r.status === 422 ? 409 : 400, error: r.status === 422 ? 'هذا الرقم مسجل لحساب آخر' : (j.msg || j.message || 'تعذر إنشاء الحساب') };
  return { status: 200, id: j.id || (j.user && j.user.id) };
}

/* ---------- إشعار من التطبيق (مهمة، دفعة، منشور) ---------- */
async function notify(req, items) {
  const prof = await caller(req);
  if (!prof) return { status: 401, sent: 0 };
  const me = { id: prof.id };
  const all = await db('GET', 'profiles?select=id,role,client_id,active');
  let sent = 0; sendTo.subs = 0; lastErr.length = 0;
  if (!env('VAPID_PUBLIC') || !env('VAPID_PRIVATE')) return { status: 200, sent: 0, subs: 0, errors: ['secrets: VAPID_PUBLIC أو VAPID_PRIVATE ناقص'] };
  for (const it of (items || []).slice(0, 20)) {
    let ids = [];
    if (it.to === 'managers') ids = all.filter((p) => p.role === 'manager' && p.active !== false).map((p) => p.id);
    else if (it.to && it.to.client) ids = prof.role === 'manager' ? all.filter((p) => p.role === 'client' && p.client_id === it.to.client && p.active !== false).map((p) => p.id) : [];
    else if (Array.isArray(it.to)) ids = it.to.filter((id) => prof.role === 'manager' || id === me.id);
    sent += await sendTo(ids, { title: String(it.title || '').slice(0, 120), body: String(it.body || '').slice(0, 300), tag: it.tag || '', url: it.url || './' });
  }
  return { status: 200, sent, subs: sendTo.subs, errors: lastErr.slice(0, 5), key: env('VAPID_PUBLIC').slice(0, 12) };
}

/* ---------- نسيت كلمة السر: إشعار للمدير + رقم شفق للواتساب ---------- */
async function forgot(phone) {
  const d = String(phone || '').replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632)).replace(/\D/g, '').replace(/^00/, '').replace(/^963/, '').replace(/^0/, '');
  const st = await db('GET', "settings?select=value&key=eq.shafq_phone");
  const mgr = await db('GET', 'profiles?select=id,phone&role=eq.manager&active=is.true');
  const shafq = (st[0] && st[0].value) || (mgr[0] && mgr[0].phone) || '';
  if (d.length >= 8) {
    const all = await db('GET', 'profiles?select=id,name,phone,login_phone,role');
    const who = all.find((p) => String(p.login_phone || p.phone || '').replace(/\D/g, '').endsWith(d));
    // حد للطلبات: مرة كل 10 دقايق لكل حساب، و30 طلب بالساعة للكل
    const rlRow = await db('GET', 'settings?select=value&key=eq.forgot_rl'), now = Date.now();
    const rl = Object.assign({ hour: 0, n: 0, last: {} }, (rlRow[0] && rlRow[0].value) || {});
    if (now - rl.hour > 3600e3) { rl.hour = now; rl.n = 0; }
    rl.n++;
    const allowed = who && rl.n <= 30 && !(rl.last[who.id] && now - rl.last[who.id] < 600e3);
    if (allowed) rl.last[who.id] = now;
    await db('POST', 'settings?on_conflict=key', { key: 'forgot_rl', value: rl }, 'resolution=merge-duplicates,return=minimal');
    if (allowed) await sendTo(mgr.map((m) => m.id), { title: 'طلب كلمة سر جديدة 🔑', body: (who.name || '') + (who.role === 'client' ? ' (عميل)' : '') + ' · ' + (who.login_phone || who.phone || ''), tag: 'forgot-' + who.id, url: who.role === 'client' ? './#/clients' : './#/team' });
  }
  return { status: 200, phone: shafq };
}

async function handle(req) {
  const CORS = corsFor(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: CORS });
  if (Number(req.headers.get('content-length') || 0) > 20000) return new Response('too large', { status: 413, headers: CORS });
  try {
    const b = await req.json().catch(() => ({}));
    let out;
    if (b.action === 'cron') {
      // التشغيل الدوري: من قاعدة البيانات بس، وبكلمة سر (CRON_SECRET) إذا محطوطة
      const cs = env('CRON_SECRET'), got = req.headers.get('x-cron-secret') || '';
      let diff = got.length ^ cs.length; for (let i = 0; i < cs.length; i++) diff |= cs.charCodeAt(i) ^ (got.charCodeAt(i) || 0);
      const okSecret = !cs || diff === 0;
      out = req.headers.get('origin') || !okSecret ? { status: 403, error: 'cron is server-only' } : await cron();
    }
    else if (b.action === 'notify') out = await notify(req, b.items);
    else if (b.action === 'forgot') out = await forgot(b.phone);
    else if (b.action === 'create_user') out = await createUser(req, b.phone, b.pass);
    else out = { status: 400, error: 'unknown action' };
    return new Response(JSON.stringify(out), { status: out.status && out.status !== 200 ? out.status : 200, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS) });
  } catch (e) {
    console.log('push error', e && e.stack || e);
    return new Response(JSON.stringify({ error: 'server error' }), { status: 500, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS) });
  }
}

if (globalThis.Deno) Deno.serve(handle);
globalThis.__shafqPush = { encrypt, vapidHeader, cron, notify, handle, damascus };
