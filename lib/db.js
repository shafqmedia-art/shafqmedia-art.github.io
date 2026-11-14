// تخزين بسيط بملف JSON — كافي لعشرات الحسابات وآلاف المشتركين
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const FILE = path.join(DATA_DIR, 'db.json');
const UPLOADS = path.join(DATA_DIR, 'uploads');

const COLLECTIONS = [
  'users', 'accounts', 'groups', 'blocks', 'categories', 'products', 'orders',
  'subscribers', 'broadcasts', 'logs',
  'tenants', 'plans', 'requests', 'coupons', 'posts',
];

const newId = () => crypto.randomBytes(6).toString('hex');

let state = null;
let saveTimer = null;

function load() {
  if (state) return state;
  try {
    state = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    state = {};
  }
  for (const c of COLLECTIONS) state[c] ||= [];
  state.stats ||= {};
  state.settings ||= {};
  migrate(state);
  return state;
}

// تحويل بيانات النسخة الأولى (rules فيها reply / publicReply كنص)
function migrate(s) {
  for (const a of s.accounts) {
    a.rules ||= [];
    for (const r of a.rules) {
      if (r.dm) continue;
      r.title ||= (r.keywords || []).join('، ');
      r.scope ||= 'all';
      r.dm = { items: r.reply ? [{ type: 'text', text: r.reply, buttons: [] }] : [] };
      r.publicReplies = String(r.publicReply || '').split('\n').map((x) => x.trim()).filter(Boolean);
      r.options ||= {};
      r.status = r.enabled === false ? 'inactive' : 'active';
      r.createdAt ||= Date.now();
      delete r.reply; delete r.publicReply;
    }
    a.dmDefault ||= { enabled: false, keywords: [], message: { items: [] } };
    a.messenger ||= { greeting: '', getStartedBlock: '', menu: [] };
    a.store ||= {
      enabled: false, template: 'shop', welcome: '', imageRatio: 'horizontal', lang: 'ar',
      address: '', mobile: '', phone: '', whatsapp: '', currency: 'SYP', needTransfer: false,
    };
    a.badWords ||= { enabled: false, words: [], action: 'hide' };
    a.assistant ||= { enabled: false, about: '', tone: 'ودود ومختصر', handoff: 'رح يرد عليك حدا من الفريق بأقرب وقت' };
  }
  // النسخة 2 كانت بدون زباين: كل شي بيصير لـ "شفق ميديا" (الحساب الأساسي للمنصة)
  if (s.users.length && s.users.some((u) => !u.tenantId)) {
    let house = s.tenants.find((t) => t.house);
    if (!house) {
      house = { id: newId(), name: 'شفق ميديا', house: true, status: 'active', planId: 'max', platforms: 'fbig', createdAt: Date.now(), updatedAt: Date.now() };
      s.tenants.push(house);
    }
    let first = true;
    for (const u of s.users) {
      if (u.tenantId) continue;
      u.tenantId = house.id;
      if (u.role === 'admin' && first && !s.users.some((x) => x.role === 'super')) { u.role = 'super'; first = false; }
    }
    for (const a of s.accounts) a.tenantId ||= house.id;
  }
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, FILE); // كتابة آمنة: ما بيخرب الملف إذا انقطع السيرفر بالنص
}

// حفظ مؤجّل (للأحداث الكتيرة متل الإحصائيات)
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; save(); }, 1500);
}


// ---------- عمليات عامة على أي مجموعة ----------
const all = (col) => load()[col];
const get = (col, id) => load()[col].find((x) => x.id === id);
const where = (col, fn) => load()[col].filter(fn);

function insert(col, obj) {
  const item = { id: newId(), createdAt: Date.now(), updatedAt: Date.now(), ...obj };
  load()[col].push(item);
  save();
  return item;
}

function update(col, id, patch) {
  const item = get(col, id);
  if (!item) return null;
  Object.assign(item, patch, { updatedAt: Date.now() });
  save();
  return item;
}

function remove(col, id) {
  const s = load();
  s[col] = s[col].filter((x) => x.id !== id);
  save();
}

function removeWhere(col, fn) {
  const s = load();
  s[col] = s[col].filter((x) => !fn(x));
  save();
}

// ترتيب عناصر حسب قائمة أرقام
function reorder(col, ids) {
  ids.forEach((id, i) => {
    const item = get(col, id);
    if (item) item.order = i;
  });
  save();
}

// ---------- الحسابات ----------
const listAccounts = (tenantId) => (tenantId ? all('accounts').filter((a) => a.tenantId === tenantId) : all('accounts'));
const settings = () => load().settings;
function setSettings(patch) { Object.assign(load().settings, patch); save(); return state.settings; }
const getAccount = (id) => get('accounts', id);
const findByExternal = (platform, externalId) =>
  all('accounts').find((a) => a.platform === platform && a.externalId === String(externalId));

function upsertAccount({ platform, externalId, name, username, pageId, token, tenantId }) {
  let acc = findByExternal(platform, externalId);
  if (acc) {
    Object.assign(acc, { name, username, pageId: String(pageId), token, tenantId: tenantId || acc.tenantId, updatedAt: Date.now() });
    save();
    return acc;
  }
  acc = insert('accounts', {
    tenantId, platform, externalId: String(externalId), name, username: username || '',
    pageId: String(pageId), token, enabled: true,
    welcome: { enabled: false, text: '' }, rules: [],
  });
  migrate(state);
  save();
  return acc;
}

const updateAccount = (id, patch) => update('accounts', id, patch);

function deleteAccount(id) {
  for (const c of ['groups', 'blocks', 'categories', 'products', 'orders', 'subscribers']) {
    removeWhere(c, (x) => x.accountId === id);
  }
  remove('accounts', id);
  delete load().stats[id];
  save();
}

// ---------- قواعد الرد التلقائي (جوّا الحساب) ----------
function addRule(accId, rule) {
  const acc = getAccount(accId);
  if (!acc) return null;
  const r = { id: newId(), createdAt: Date.now(), status: 'active', ...rule };
  acc.rules.push(r);
  save();
  return r;
}

function updateRule(accId, ruleId, patch) {
  const rule = getAccount(accId)?.rules.find((r) => r.id === ruleId);
  if (!rule) return null;
  Object.assign(rule, patch);
  save();
  return rule;
}

function deleteRule(accId, ruleId) {
  const acc = getAccount(accId);
  if (!acc) return;
  acc.rules = acc.rules.filter((r) => r.id !== ruleId);
  save();
}

// ---------- المشتركين (اللي راسلوا الصفحة) ----------
function touchSubscriber(acc, psid, patch = {}) {
  let sub = all('subscribers').find((s) => s.accountId === acc.id && s.psid === String(psid));
  const now = Date.now();
  if (!sub) {
    sub = {
      id: newId(), accountId: acc.id, psid: String(psid), platform: acc.platform,
      name: '', firstAt: now, lastAt: now, lastMessageAt: 0, posts: [], cart: [], seenRules: [],
    };
    all('subscribers').push(sub);
  }
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) sub[k] = v;
  sub.lastAt = now;
  saveSoon();
  return sub;
}

// ---------- الإحصائيات اليومية ----------
// kind: blocks | clicks | auto | text
const dayKey = (t = Date.now()) =>
  new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Damascus' });

function stat(accId, kind, n = 1) {
  const s = load().stats;
  s[accId] ||= {};
  const d = (s[accId][dayKey()] ||= { blocks: 0, clicks: 0, auto: 0, text: 0 });
  d[kind] = (d[kind] || 0) + n;
  saveSoon();
}

function statsRange(accId, days = 14) {
  const s = load().stats[accId] || {};
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(Date.now() - i * 864e5);
    out.push({ day: k, ...{ blocks: 0, clicks: 0, auto: 0, text: 0 }, ...(s[k] || {}) });
  }
  return out;
}

// ---------- السجل ----------
function log(entry) {
  const s = load();
  s.logs.unshift({ at: Date.now(), ...entry });
  s.logs = s.logs.slice(0, 500);
  saveSoon();
}

const listLogs = (accId) => (accId ? all('logs').filter((l) => l.accountId === accId) : all('logs'));

module.exports = {
  DATA_DIR, UPLOADS, newId, load, save, saveSoon, settings, setSettings,
  all, get, where, insert, update, remove, removeWhere, reorder,
  listAccounts, getAccount, findByExternal, upsertAccount, updateAccount, deleteAccount,
  addRule, updateRule, deleteRule, touchSubscriber, stat, statsRange, dayKey, log, listLogs,
};
