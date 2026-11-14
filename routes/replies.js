// الردود التلقائية + الرد على الرسائل
const db = require('../lib/db');
const H = require('../lib/http');
const meta = require('../lib/meta');
const M = require('../lib/messages');
const { findRule, keywordsMatch, normalize } = require('../lib/rules');
const { STORE_WORDS } = require('../lib/store');
const { esc } = require('../views/ui');
const V = require('../views/autoreply');

const parseJSON = (s, fallback) => { try { const v = JSON.parse(s); return v ?? fallback; } catch { return fallback; } };
const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
const accBlocks = (acc) => db.where('blocks', (b) => b.accountId === acc.id);

function specFrom(raw) {
  const v = parseJSON(raw, { items: [] });
  return { items: Array.isArray(v.items) ? v.items : [] };
}

function keywordsFrom(raw) {
  const v = parseJSON(raw, null);
  if (Array.isArray(v)) return v.map((k) => String(k).trim()).filter(Boolean);
  return String(raw || '').split(/[,،\n]/).map((k) => k.trim()).filter(Boolean);
}

function ruleFromForm(f) {
  const options = {};
  for (const k of ['requireMention', 'appendReplyToDm', 'autoLike', 'onlyIfLiked', 'allowRepeat']) options[k] = f[`opt_${k}`] === 'on';
  const on = ['dm', 'comment', 'both'].includes(f.on) ? f.on : 'both';
  return {
    title: String(f.title || '').trim().slice(0, 120),
    on,
    scope: on === 'dm' ? 'all' : ['post', 'all', 'newpost'].includes(f.scope) ? f.scope : 'all',
    postId: f.postId || '', postText: String(f.postText || '').slice(0, 300), postLink: f.postLink || '',
    keywords: keywordsFrom(f.keywords),
    match: f.match === 'exact' ? 'exact' : 'contains',
    publicReplies: lines(f.publicReplies),
    dm: specFrom(f.dm),
    options,
    status: ['active', 'inactive', 'scheduled'].includes(f.status) ? f.status : 'active',
    from: f.from || '', to: f.to || '',
  };
}

function testReply(acc, text, kind) {
  const notice = acc.enabled ? '' : '<div class="muted small">البوت موقّف لهالحساب هلق، يعني بالواقع ما رح ينبعت شي.</div>';
  const bubble = (t) => `<div class="bubble">${esc(t)}</div>`;
  if (kind === 'dm' && acc.store?.enabled && STORE_WORDS.map(normalize).includes(normalize(text))) {
    return `${notice}<div><span class="tag ok">المتجر</span> رح تنبعت الصفحة الرئيسية للمتجر.</div>`;
  }
  const rule = findRule(acc.rules, text, kind);
  if (rule) {
    let out = `<div><span class="tag ok">طابق</span> <b>${esc(rule.title || rule.keywords.join('، '))}</b></div>`;
    if (kind === 'comment' && rule.scope !== 'all') out += '<div class="muted small">(هالقاعدة لمنشور محدد بس)</div>';
    if (kind === 'comment' && rule.publicReplies?.length) out += `<div class="small muted">الرد العلني (بينختار واحد عشوائياً):</div>${rule.publicReplies.map(bubble).join('')}`;
    if (!M.isEmpty(rule.dm)) out += `<div class="small muted">الرسالة بالخاص:</div>${bubble(M.preview(rule.dm))}`;
    return notice + out;
  }
  if (kind === 'dm') {
    const d = acc.dmDefault;
    if (d?.enabled && !M.isEmpty(d.message) && keywordsMatch(d.keywords, text)) {
      return `${notice}<div><span class="tag ok">الرد الافتراضي</span></div>${bubble(M.preview(d.message))}`;
    }
    if (acc.welcome?.enabled && acc.welcome.text) return `${notice}<div><span class="tag">ما طابق ولا رد</span> رح تنبعت رسالة الترحيب (مرة باليوم لكل شخص):</div>${bubble(acc.welcome.text)}`;
  }
  return `${notice}<div><span class="tag">ما طابق ولا رد</span> البوت ما رح يرد على هالرسالة.</div>`;
}

function ruleStats(acc) {
  const out = {};
  for (const l of db.listLogs(acc.id)) {
    if (l.result !== 'replied' || !l.rule) continue;
    const r = acc.rules.find((x) => (x.title || x.keywords.join('، ')) === l.rule);
    if (r) out[r.id] = (out[r.id] || 0) + 1;
  }
  return out;
}

// إذا اخترت "إنشاء منشور جديد": منعمل المنشور ومنربط القاعدة فيه
async function maybeCreatePost(acc, rule, f) {
  if (rule.scope !== 'newpost') return null;
  const text = String(f.newPostText || '').trim();
  if (!text && !f.newPostImage) return 'لازم تكتب نص المنشور الجديد.';
  const postId = await meta.createPost(acc, {
    text, imageUrl: f.newPostImage ? M.absUrl(f.newPostImage) : '', publishAt: f.schedulePost === 'on' && f.newPostAt ? f.newPostAt : null,
  });
  Object.assign(rule, { scope: 'post', postId, postText: text.slice(0, 300), postLink: `https://facebook.com/${postId}` });
  return null;
}

module.exports = (r) => {
  const base = (acc) => `/a/${acc.id}/replies`;

  r.get('/a/:acc/replies', (req, res, { ctx, query }) => {
    H.send(res, 200, V.repliesPage(ctx, { q: String(query.q || '').trim(), stats: ruleStats(ctx.acc) }));
  });

  r.post('/a/:acc/replies/test', async (req, res, { ctx, form }) => {
    const { fields } = await form();
    const testResult = testReply(ctx.acc, fields.text || '', fields.kind === 'comment' ? 'comment' : 'dm');
    H.send(res, 200, V.repliesPage(ctx, { q: '', stats: ruleStats(ctx.acc), testResult }));
  });

  r.post('/a/:acc/replies/toggle-all', (req, res, { ctx }) => {
    const anyActive = ctx.acc.rules.some((x) => x.status !== 'inactive');
    for (const rule of ctx.acc.rules) rule.status = anyActive ? 'inactive' : 'active';
    db.save();
    H.redirect(res, base(ctx.acc), anyActive ? 'وقّفنا كل الردود' : 'فعّلنا كل الردود');
  });

  r.get('/a/:acc/replies/new', (req, res, { ctx }) => H.send(res, 200, V.ruleForm(ctx, null, accBlocks(ctx.acc))));

  r.post('/a/:acc/replies/new', async (req, res, { ctx, form }) => {
    const { fields } = await form();
    const rule = ruleFromForm(fields);
    try {
      const err = await maybeCreatePost(ctx.acc, rule, fields);
      if (err) return H.redirect(res, `${base(ctx.acc)}/new`, err);
    } catch (e) {
      return H.redirect(res, `${base(ctx.acc)}/new`, `ما قدرنا ننشر المنشور: ${e.message}`);
    }
    if (rule.on !== 'comment' && rule.scope === 'all' && !rule.keywords.length && rule.on === 'dm') {
      return H.redirect(res, `${base(ctx.acc)}/new`, 'للدايركت لازم تحط كلمات مفتاحية. للرد على كل الرسائل استخدم "الرد على الرسائل".');
    }
    db.addRule(ctx.acc.id, rule);
    H.redirect(res, base(ctx.acc), 'انضاف الرد');
  });

  r.get('/a/:acc/replies/:id', (req, res, { ctx, params }) => {
    const rule = ctx.acc.rules.find((x) => x.id === params.id);
    if (!rule) return H.redirect(res, base(ctx.acc), 'الرد مو موجود.');
    H.send(res, 200, V.ruleForm(ctx, rule, accBlocks(ctx.acc)));
  });

  r.post('/a/:acc/replies/:id', async (req, res, { ctx, params, form }) => {
    const { fields } = await form();
    const rule = ruleFromForm(fields);
    try {
      const err = await maybeCreatePost(ctx.acc, rule, fields);
      if (err) return H.redirect(res, `${base(ctx.acc)}/${params.id}`, err);
    } catch (e) {
      return H.redirect(res, `${base(ctx.acc)}/${params.id}`, `ما قدرنا ننشر المنشور: ${e.message}`);
    }
    db.updateRule(ctx.acc.id, params.id, rule);
    H.redirect(res, base(ctx.acc), 'انحفظ الرد');
  });

  r.post('/a/:acc/replies/:id/toggle', (req, res, { ctx, params }) => {
    const rule = ctx.acc.rules.find((x) => x.id === params.id);
    if (rule) db.updateRule(ctx.acc.id, rule.id, { status: rule.status === 'inactive' ? 'active' : 'inactive' });
    H.redirect(res, base(ctx.acc));
  });

  r.post('/a/:acc/replies/:id/copy', (req, res, { ctx, params }) => {
    const rule = ctx.acc.rules.find((x) => x.id === params.id);
    if (rule) {
      const { id, seen, createdAt, ...rest } = structuredClone(rule);
      db.addRule(ctx.acc.id, { ...rest, title: `${rule.title} (نسخة)`, status: 'inactive' });
    }
    H.redirect(res, base(ctx.acc), 'انعملت نسخة (موقّفة لحتى تفعّلها).');
  });

  r.post('/a/:acc/replies/:id/delete', (req, res, { ctx, params }) => {
    db.deleteRule(ctx.acc.id, params.id);
    H.redirect(res, base(ctx.acc), 'انحذف الرد.');
  });

  // ---- الرد على الرسائل ----
  r.get('/a/:acc/dm', (req, res, { ctx }) => H.send(res, 200, V.dmPage(ctx, accBlocks(ctx.acc))));

  r.post('/a/:acc/dm/default', async (req, res, { ctx, form }) => {
    const { fields } = await form();
    db.updateAccount(ctx.acc.id, { dmDefault: { enabled: fields.enabled === 'on', keywords: keywordsFrom(fields.keywords), message: specFrom(fields.message) } });
    H.redirect(res, `/a/${ctx.acc.id}/dm`, 'انحفظ الرد الافتراضي');
  });

  r.post('/a/:acc/dm/welcome', async (req, res, { ctx, form }) => {
    const { fields } = await form();
    db.updateAccount(ctx.acc.id, { welcome: { enabled: fields.enabled === 'on', text: String(fields.text || '').trim() } });
    H.redirect(res, `/a/${ctx.acc.id}/dm`, 'انحفظت رسالة الترحيب');
  });
};

module.exports.specFrom = specFrom;
module.exports.parseJSON = parseJSON;
