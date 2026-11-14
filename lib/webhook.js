// قراءة أحداث Meta وتنفيذ الردود: الدايركت، الأزرار، التعليقات، الستوري، المتجر
const db = require('./db');
const meta = require('./meta');
const M = require('./messages');
const store = require('./store');
const { findRule, keywordsMatch, normalize } = require('./rules');
const P = require('./plans');
const ai = require('./ai');

// يحوّل جسم الـ webhook لقائمة أحداث موحّدة
function parseEvents(body) {
  const events = [];
  const platform = body.object === 'page' ? 'facebook' : body.object === 'instagram' ? 'instagram' : null;
  if (!platform) return events;

  for (const entry of body.entry || []) {
    const externalId = String(entry.id);

    for (const m of entry.messaging || []) {
      const senderId = String(m.sender?.id || '');
      if (!senderId || senderId === externalId) continue;
      if (m.message?.is_echo) continue; // رسائلنا نحنا
      const base = { platform, externalId, senderId };
      if (m.postback) {
        events.push({ ...base, kind: 'postback', payload: m.postback.payload || '', title: m.postback.title || '' });
      } else if (m.message?.quick_reply?.payload) {
        events.push({ ...base, kind: 'postback', payload: m.message.quick_reply.payload, title: m.message.text || '' });
      } else if (m.referral) {
        events.push({ ...base, kind: 'referral', ref: m.referral.ref || '' });
      } else if (m.message) {
        events.push({
          ...base, kind: 'dm', text: m.message.text || '',
          story: Boolean(m.message.reply_to?.story), attachments: (m.message.attachments || []).length,
        });
      }
    }

    for (const c of entry.changes || []) {
      const v = c.value || {};
      if (platform === 'facebook' && c.field === 'feed' && v.item === 'comment' && v.verb === 'add') {
        events.push({
          platform, externalId, kind: 'comment', senderId: String(v.from?.id || ''), name: v.from?.name || '',
          text: v.message || '', commentId: v.comment_id, postId: v.post_id, parentId: v.parent_id,
          createdAt: v.created_time ? Number(v.created_time) * 1000 : Date.now(),
        });
      }
      if (platform === 'instagram' && c.field === 'comments') {
        events.push({
          platform, externalId, kind: 'comment', senderId: String(v.from?.id || ''), username: v.from?.username || '',
          name: v.from?.username || '', text: v.text || '', commentId: v.id, postId: v.media?.id, parentId: v.parent_id,
          createdAt: Date.now(),
        });
      }
    }
  }
  return events;
}

// ---------- أدوات ----------
async function sendSpec(acc, psid, spec, vars = {}, opts = {}) {
  if (!P.can(db.get('tenants', acc.tenantId), 'richDm')) spec = M.textOnly(spec);
  const msgs = M.toMessages(acc, spec, vars);
  for (const m of msgs) await meta.send(acc, { id: psid }, m, opts);
  return msgs.length;
}

async function sendBlock(acc, psid, blockId, vars) {
  const block = db.get('blocks', blockId);
  if (!block || block.accountId !== acc.id) return false;
  await sendSpec(acc, psid, { items: block.items }, vars);
  db.stat(acc.id, 'blocks');
  return true;
}

// رسالة الترحيب: مرة وحدة لكل شخص كل 24 ساعة
const welcomed = new Map();
function shouldWelcome(key) {
  const last = welcomed.get(key);
  if (last && Date.now() - last < 864e5) return false;
  welcomed.set(key, Date.now());
  if (welcomed.size > 5000) welcomed.delete(welcomed.keys().next().value);
  return true;
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function fillName(ev, text) {
  const who = ev.platform === 'instagram' && ev.username ? `@${ev.username}` : ev.name || '';
  return String(text).replace(/\{(name|الاسم)\}/g, who).replace(/\s+/g, ' ').trim();
}

async function ensureName(acc, sub) {
  if (sub.name || sub._fetching) return;
  sub._fetching = true;
  sub.name = await meta.profileName(acc, sub.psid);
  delete sub._fetching;
  db.saveSoon();
}

// ---------- الدايركت ----------
async function handleDM(acc, ev) {
  const sub = db.touchSubscriber(acc, ev.senderId, { lastMessageAt: Date.now() });
  ensureName(acc, sub).catch(() => {});
  db.stat(acc.id, 'text');
  const vars = { name: sub.name };
  const base = { accountId: acc.id, kind: ev.story ? 'story' : 'dm', text: (ev.text || (ev.attachments ? 'مرفق' : '')).slice(0, 200) };

  // كلمة "متجر" ← المتجر
  if (acc.store?.enabled && P.can(db.get('tenants', acc.tenantId), 'store') && store.STORE_WORDS.map(normalize).includes(normalize(ev.text))) {
    await store.home(acc, ev.senderId, vars);
    return db.log({ ...base, result: 'store' });
  }

  const rule = findRule(acc.rules, ev.text, 'dm');
  if (rule && !M.isEmpty(rule.dm)) {
    await sendSpec(acc, ev.senderId, rule.dm, vars);
    db.stat(acc.id, 'auto');
    return db.log({ ...base, result: 'replied', rule: rule.title || rule.keywords.join('، ') });
  }

  const tenant = db.get('tenants', acc.tenantId);
  if (ev.story && !P.can(tenant, 'reelsStory')) return db.log({ ...base, result: 'skipped', error: 'الرد على الستوري مو ضمن الباقة' });

  // مساعد شفق الذكي
  if (acc.assistant?.enabled && ev.text && P.can(tenant, 'aiAssistant') && ai.textReady() && P.aiBalance(tenant) > 0) {
    try {
      const reply = await ai.assistantReply(tenant, acc, { text: ev.text, name: sub.name });
      if (reply) {
        await meta.sendText(acc, ev.senderId, reply.slice(0, 1900));
        db.stat(acc.id, 'auto');
        return db.log({ ...base, result: 'ai' });
      }
    } catch (err) {
      db.log({ ...base, result: 'error', error: `المساعد الذكي: ${err.message}` });
    }
  }

  const d = acc.dmDefault;
  if (d?.enabled && !M.isEmpty(d.message) && keywordsMatch(d.keywords, ev.text, 'contains')) {
    await sendSpec(acc, ev.senderId, d.message, vars);
    db.stat(acc.id, 'auto');
    return db.log({ ...base, result: 'default' });
  }

  if (acc.welcome?.enabled && acc.welcome.text && shouldWelcome(acc.id + ev.senderId)) {
    await meta.sendText(acc, ev.senderId, M.fill(acc.welcome.text, vars));
    return db.log({ ...base, result: 'welcome' });
  }
  db.log({ ...base, result: 'no-match' });
}

// ---------- الأزرار ----------
async function handlePostback(acc, ev) {
  const sub = db.touchSubscriber(acc, ev.senderId, { lastMessageAt: Date.now() });
  ensureName(acc, sub).catch(() => {});
  db.stat(acc.id, 'clicks');
  const p = String(ev.payload || '');
  const base = { accountId: acc.id, kind: 'click', text: ev.title || p };

  if (p === 'GET_STARTED') {
    const target = acc.messenger?.getStartedBlock;
    if (target === 'STORE' && acc.store?.enabled) await store.home(acc, ev.senderId, { name: sub.name });
    else if (!(target && (await sendBlock(acc, ev.senderId, target, { name: sub.name })))) {
      if (acc.store?.enabled) await store.home(acc, ev.senderId, { name: sub.name });
      else if (acc.welcome?.text) await meta.sendText(acc, ev.senderId, M.fill(acc.welcome.text, { name: sub.name }));
    }
    return db.log({ ...base, text: 'زر "ابدأ"', result: 'replied' });
  }
  if (p.startsWith('BLOCK:')) {
    await sendBlock(acc, ev.senderId, p.slice(6), { name: sub.name });
    return db.log({ ...base, result: 'replied' });
  }
  if (p.startsWith('CALL:')) {
    await meta.sendText(acc, ev.senderId, `رقمنا: +${p.slice(5)}`);
    return db.log({ ...base, result: 'replied' });
  }
  if (acc.store?.enabled && P.can(db.get('tenants', acc.tenantId), 'store') && (await store.handlePayload(acc, ev.senderId, p))) {
    return db.log({ ...base, result: 'store' });
  }
  db.log({ ...base, result: 'no-match' });
}

// ---------- التعليقات ----------
async function handleComment(acc, ev) {
  if (!ev.senderId || ev.senderId === acc.externalId || ev.senderId === acc.pageId) return; // تعليق باسم الصفحة
  const base = { accountId: acc.id, kind: 'comment', text: ev.text.slice(0, 200), postId: ev.postId };
  const tenant = db.get('tenants', acc.tenantId);

  // فلترة الكلمات النابية: إخفاء أو حذف التعليق، وما منرد عليه
  const bw = acc.badWords;
  if (bw?.enabled && (bw.words || []).length && P.can(tenant, 'badWords') && keywordsMatch(bw.words, ev.text, 'contains')) {
    try {
      await meta.moderateComment(acc, ev.commentId, bw.action);
      return db.log({ ...base, result: 'filtered', error: bw.action === 'delete' ? 'انحذف' : 'انخفى' });
    } catch (err) {
      return db.log({ ...base, result: 'error', error: `الفلترة: ${err.message}` });
    }
  }

  const rule = findRule(acc.rules, ev.text, 'comment', { postId: ev.postId });
  if (!rule) return db.log({ ...base, result: 'no-match' });
  const o = { ...(rule.options || {}) };
  if (!P.can(tenant, 'autoLike')) o.autoLike = false;
  if (!P.can(tenant, 'likeRequired')) o.onlyIfLiked = false;

  // التعليقات اللي قبل تفعيل القاعدة ما بينرد عليها
  if (ev.createdAt && rule.createdAt && ev.createdAt + 60e3 < rule.createdAt) return;
  if (o.requireMention && !ev.text.includes('@')) return db.log({ ...base, result: 'skipped', rule: rule.title, error: 'بدون منشن' });

  // تعليقات متكررة لنفس الشخص
  rule.seen ||= [];
  if (!o.allowRepeat && rule.seen.includes(ev.senderId)) return db.log({ ...base, result: 'skipped', rule: rule.title, error: 'تعليق متكرر' });

  try {
    if (o.onlyIfLiked && !(await meta.userReactedToPost(acc, ev.postId, ev.senderId))) {
      return db.log({ ...base, result: 'skipped', rule: rule.title, error: 'ما عامل إعجاب بالمنشور' });
    }
    rule.seen.push(ev.senderId);
    if (rule.seen.length > 5000) rule.seen = rule.seen.slice(-4000);
    db.saveSoon();

    if (o.autoLike) meta.likeComment(acc, ev.commentId).catch((e) => console.error('like', e.message));

    let replies = (rule.publicReplies || []).filter(Boolean);
    if (!P.can(tenant, 'multiReplies')) replies = replies.slice(0, 1);
    const chosen = replies.length ? fillName(ev, pick(replies)) : '';

    // الرد الخاص: مسموح رسالة وحدة بس على التعليق
    if (!M.isEmpty(rule.dm)) {
      const spec = P.can(tenant, 'richDm') ? rule.dm : M.textOnly(rule.dm);
      const msgs = M.toMessages(acc, spec, { name: ev.name });
      if (o.appendReplyToDm && chosen) {
        const first = msgs[0];
        if (first?.text) first.text = `${chosen}\n\n${first.text}`;
        else if (first?.attachment?.payload?.template_type === 'button') first.attachment.payload.text = `${chosen}\n\n${first.attachment.payload.text}`.slice(0, 640);
      }
      if (msgs[0]) {
        const r = await meta.send(acc, { comment_id: ev.commentId }, msgs[0]);
        if (r?.recipient_id) {
          const sub = db.touchSubscriber(acc, r.recipient_id, { name: ev.name || undefined });
          if (ev.postId && !sub.posts.includes(ev.postId)) sub.posts.push(ev.postId);
        }
      }
    }
    if (chosen) await meta.publicReply(acc, ev.commentId, chosen);
    db.stat(acc.id, 'auto');
    db.log({ ...base, result: 'replied', rule: rule.title || (rule.keywords || []).join('، ') });
  } catch (err) {
    console.error('comment reply failed:', err.message);
    db.log({ ...base, result: 'error', rule: rule.title, error: err.message });
  }
}

async function handleEvent(ev) {
  const acc = db.findByExternal(ev.platform, ev.externalId);
  if (!acc || !acc.enabled) return;
  if (!P.isLive(db.get('tenants', acc.tenantId))) return; // الاشتراك منتهي أو موقوف
  try {
    if (ev.kind === 'dm') return await handleDM(acc, ev);
    if (ev.kind === 'postback') return await handlePostback(acc, ev);
    if (ev.kind === 'referral') {
      db.touchSubscriber(acc, ev.senderId, { lastMessageAt: Date.now() });
      if (ev.ref === 'store' && acc.store?.enabled) await store.home(acc, ev.senderId);
      return;
    }
    if (ev.kind === 'comment') return await handleComment(acc, ev);
  } catch (err) {
    console.error('Reply failed:', err.message);
    db.log({ accountId: acc.id, kind: ev.kind, text: String(ev.text || ev.payload || '').slice(0, 200), result: 'error', error: err.message });
  }
}

module.exports = { parseEvents, handleEvent, sendSpec, sendBlock };
