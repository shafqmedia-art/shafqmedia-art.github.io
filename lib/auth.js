// المستخدمين (فريق الإدارة) والجلسات
const crypto = require('node:crypto');
const db = require('./db');

const SESSION_DAYS = 30;
const secret = () => process.env.SESSION_SECRET || '';

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function checkPassword(user, password) {
  if (!user || !user.salt || !user.hash) return false;
  const { hash } = hashPassword(String(password).slice(0, 200), user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.hash, 'hex'));
}

const normUser = (u) => String(u || '').trim().toLowerCase();
const findUser = (username) => db.all('users').find((u) => u.username === normUser(username));

// كلمة السر: 8 أحرف على الأقل، ومو من الكلمات المشهورة
const WEAK = new Set(['12345678', '123456789', '1234567890', 'password', 'password1', 'qwertyui', '11111111', '00000000', 'admin123', 'shafq123', 'abcd1234']);
function checkStrength(password) {
  const p = String(password || '');
  if (p.length < 8) throw new Error('كلمة السر لازم تكون 8 أحرف على الأقل');
  if (p.length > 200) throw new Error('كلمة السر طويلة كتير');
  if (WEAK.has(p.toLowerCase()) || /^(.)\1+$/.test(p)) throw new Error('كلمة السر سهلة كتير، اختار وحدة أصعب');
}

const ROLES = { super: 'مدير المنصة', admin: 'مدير', editor: 'محرر' };

function createUser({ username, password, name = '', role = 'admin', tenantId, phone = '' }) {
  username = normUser(username);
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new Error('اسم المستخدم لازم يكون 3 لـ 32 حرف إنكليزي أو رقم أو . _ -');
  checkStrength(password);
  if (findUser(username)) throw new Error('اسم المستخدم موجود قبل');
  return db.insert('users', { username, name, phone, tenantId, role: ROLES[role] ? role : 'admin', ...hashPassword(password), v: 1 });
}

function setPassword(userId, password) {
  checkStrength(password);
  const u = db.get('users', userId);
  // v بتزيد ← كل الجلسات القديمة بتطلع (لازم إعادة تسجيل دخول بعد تغيير كلمة السر)
  return db.update('users', userId, { ...hashPassword(password), v: (u.v || 1) + 1 });
}

// أول تشغيل: إذا ما في ولا مستخدم، منعمل مدير من متغيرات البيئة
// أول تشغيل: حساب "شفق ميديا" (الحساب الأساسي للمنصة) + مدير المنصة من متغيرات البيئة
function ensureAdmin() {
  if (db.all('users').length) return;
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return;
  if (password.length < 10 || password.includes('غيرها')) { console.warn(' ADMIN_PASSWORD ضعيف أو لسا متل المثال. حط كلمة سر قوية (10 أحرف أو أكتر) وأعد التشغيل.'); return; }
  let house = db.all('tenants').find((t) => t.house);
  if (!house) house = db.insert('tenants', { name: 'شفق ميديا', house: true, status: 'active', planId: 'max', platforms: 'fbig' });
  createUser({ username, password, name: 'عبد الرحمن', role: 'super', tenantId: house.id });
  console.log(`انعمل حساب مدير المنصة: ${username}`);
}

// زبون جديد (تسجيل ذاتي) مع فترة تجربة
function createTenant({ name, phone = '', trialDays = 7, planId = 'pro' }) {
  return db.insert('tenants', {
    name: String(name || '').trim().slice(0, 80) || 'زبون', phone, status: 'trial', planId, platforms: 'fbig',
    trialEndsAt: Date.now() + Number(trialDays) * 864e5, expiresAt: null,
  });
}

// ---------- الجلسة: كوكي موقّعة ----------
const sign = (data) => crypto.createHmac('sha256', secret()).update(data).digest('base64url');

function makeSession(user) {
  const payload = Buffer.from(JSON.stringify({ u: user.id, v: user.v || 1, exp: Date.now() + SESSION_DAYS * 864e5 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function userFromSession(raw) {
  if (!raw || !secret()) return null;
  const [payload, sig] = String(raw).split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (p.exp < Date.now()) return null;
    const user = db.get('users', p.u);
    if (!user || (user.v || 1) !== p.v) return null;
    return user;
  } catch {
    return null;
  }
}

module.exports = { SESSION_DAYS, ROLES, createTenant, createUser, findUser, checkPassword, setPassword, ensureAdmin, makeSession, userFromSession, sign };
