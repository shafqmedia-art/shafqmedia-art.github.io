// الحملات (رسائل جماعية) + المجدول
const db = require('./db');
const meta = require('./meta');
const M = require('./messages');
const P = require('./plans');

// تاغات Meta المسموحة للإرسال بعد 24 ساعة من آخر رسالة
const TAGS = {
  CONFIRMED_EVENT_UPDATE: 'تحديث على موعد أو حدث',
  POST_PURCHASE_UPDATE: 'تحديث بعد الشراء',
  ACCOUNT_UPDATE: 'تحديث على الحساب',
  HUMAN_AGENT: 'رد من الفريق (خلال 7 أيام)',
};

const NOTIFICATIONS = { REGULAR: 'إشعار بصوت', SILENT_PUSH: 'إشعار صامت', NO_PUSH: 'بلا إشعار' };

const DAY = 864e5;
const RECENT = 60 * DAY; // المتابعين اللي راسلوا خلال آخر شهرين

function audience(b) {
  const accIds = b.accounts?.length ? b.accounts : [b.accountId];
  return db.where('subscribers', (s) =>
    accIds.includes(s.accountId) &&
    s.lastMessageAt && Date.now() - s.lastMessageAt < RECENT &&
    (b.audience !== 'post' || (s.posts || []).includes(b.postId)));
}

// آخر رسالة جماعية انبعتت من هالحساب (لتحذير "وحدة بالأسبوع")
function lastSentAt(accId) {
  const sent = db.where('broadcasts', (b) => b.sentAt && (b.accounts || [b.accountId]).includes(accId));
  return sent.reduce((m, b) => Math.max(m, b.sentAt), 0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const running = new Set();

async function sendBroadcast(id) {
  if (running.has(id)) return;
  const b = db.get('broadcasts', id);
  if (!b || b.status === 'sent' || b.status === 'sending') return;
  const tenant = db.get('tenants', db.getAccount(b.accountId)?.tenantId);
  if (!P.can(tenant, 'broadcast')) { db.update('broadcasts', id, { status: 'draft', error: 'الحملات مو ضمن الباقة أو الاشتراك منتهي' }); return; }
  running.add(id);
  db.update('broadcasts', id, { status: 'sending', startedAt: Date.now(), sent: 0, failed: 0, recipients: [] });
  const subs = audience(b);
  const recipients = [];
  let sent = 0;
  let failed = 0;
  try {
    for (const s of subs) {
      const acc = db.getAccount(s.accountId);
      if (!acc) continue;
      const within24h = Date.now() - s.lastMessageAt < DAY;
      const opts = within24h ? { update: true } : { tag: b.tag || 'CONFIRMED_EVENT_UPDATE' };
      opts.notification = b.notification || 'REGULAR';
      try {
        const spec = P.can(tenant, 'richDm') ? b.message : M.textOnly(b.message);
        for (const m of M.toMessages(acc, spec, { name: s.name })) await meta.send(acc, { id: s.psid }, m, opts);
        sent++;
        recipients.push({ psid: s.psid, name: s.name, account: acc.name, ok: true });
        db.stat(acc.id, 'blocks');
      } catch (err) {
        failed++;
        recipients.push({ psid: s.psid, name: s.name, account: acc.name, ok: false, error: err.message });
      }
      if ((sent + failed) % 20 === 0) db.update('broadcasts', id, { sent, failed });
      await sleep(120); // على دفعات حتى ما تنضغط الصفحة
    }
  } finally {
    db.update('broadcasts', id, { status: 'sent', sentAt: Date.now(), sent, failed, total: subs.length, recipients: recipients.slice(0, 3000) });
    running.delete(id);
  }
}

// كل 30 ثانية: شوف إذا في رسائل مجدولة حان وقتها
function startScheduler() {
  const tick = () => {
    for (const b of db.where('broadcasts', (x) => x.status === 'scheduled' && x.at && new Date(x.at).getTime() <= Date.now())) {
      sendBroadcast(b.id).catch((e) => console.error('broadcast', e));
    }
  };
  setInterval(tick, 30e3).unref();
  setTimeout(tick, 3e3).unref();
}

module.exports = { TAGS, NOTIFICATIONS, audience, lastSentAt, sendBroadcast, startScheduler };
