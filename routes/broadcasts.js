// الحملات
const db = require('../lib/db');
const H = require('../lib/http');
const meta = require('../lib/meta');
const B = require('../lib/broadcast');
const V = require('../views/broadcast');
const { specFrom } = require('./replies');

const mine = (acc) => db.where('broadcasts', (b) => (b.accounts || [b.accountId]).includes(acc.id)).sort((a, b) => b.updatedAt - a.updatedAt);

async function formData(ctx, b) {
  let posts = [];
  try { posts = await meta.listPosts(ctx.acc); } catch { /* بلا منشورات إذا Meta مو مربوطة */ }
  return {
    blocks: db.where('blocks', (x) => x.accountId === ctx.acc.id),
    accounts: ctx.accounts,
    audienceCount: B.audience(b || { accountId: ctx.acc.id, accounts: [ctx.acc.id], audience: 'all' }).length,
    posts,
  };
}

module.exports = (r) => {
  const base = (acc) => `/a/${acc.id}/broadcasts`;

  r.get('/a/:acc/broadcasts', (req, res, { ctx, query }) => H.send(res, 200, V.listPage(ctx, mine(ctx.acc), String(query.q || '').trim(), B.lastSentAt(ctx.acc.id))));

  r.get('/a/:acc/broadcasts/new', async (req, res, { ctx }) => H.send(res, 200, V.formPage(ctx, null, await formData(ctx, null))));

  r.get('/a/:acc/broadcasts/:id', async (req, res, { ctx, params }) => {
    const b = db.get('broadcasts', params.id);
    if (!b) return H.redirect(res, base(ctx.acc));
    H.send(res, 200, V.formPage(ctx, b, await formData(ctx, b)));
  });

  r.post('/a/:acc/broadcasts/:id/delete', (req, res, { ctx, params }) => {
    const b = db.get('broadcasts', params.id);
    if (b?.status === 'sending') return H.redirect(res, base(ctx.acc), 'الرسالة عم تنبعت هلق.');
    db.remove('broadcasts', params.id);
    H.redirect(res, base(ctx.acc), 'انحذفت.');
  });

  r.post('/a/:acc/broadcasts/:id', async (req, res, { ctx, params, form }) => {
    const { fields: f } = await form();
    const existing = params.id === 'new' ? null : db.get('broadcasts', params.id);
    if (existing && ['sent', 'sending'].includes(existing.status)) return H.redirect(res, `${base(ctx.acc)}/${existing.id}`, 'هالرسالة انبعتت.');
    let accounts = [ctx.acc.id];
    if (f.scopePages === 'many') accounts = [...new Set([ctx.acc.id, ...[].concat(f.accounts || [])])].filter((id) => ctx.accounts.some((a) => a.id === id));
    const data = {
      accountId: ctx.acc.id, accounts,
      name: String(f.name || 'حملة جديدة').trim().slice(0, 100),
      audience: f.audience === 'post' ? 'post' : 'all', postId: f.postId || '',
      tag: B.TAGS[f.tag] ? f.tag : 'CONFIRMED_EVENT_UPDATE',
      notification: B.NOTIFICATIONS[f.notification] ? f.notification : 'REGULAR',
      schedule: f.schedule === 'later' ? 'later' : 'now', at: f.at || '',
      message: specFrom(f.message),
    };
    if (!data.message.items.length) return H.redirect(res, existing ? `${base(ctx.acc)}/${existing.id}` : `${base(ctx.acc)}/new`, 'الرسالة فاضية — ضيف نص أو صورة.');
    if (data.audience === 'post' && !data.postId) return H.redirect(res, existing ? `${base(ctx.acc)}/${existing.id}` : `${base(ctx.acc)}/new`, 'اختار المنشور.');

    const send = f.action === 'send';
    if (send && data.schedule === 'later') {
      if (!data.at || new Date(data.at).getTime() < Date.now()) return H.redirect(res, existing ? `${base(ctx.acc)}/${existing.id}` : `${base(ctx.acc)}/new`, 'اختار وقت بالمستقبل للجدولة.');
      data.status = 'scheduled';
    } else {
      data.status = 'draft';
    }
    const b = existing ? db.update('broadcasts', existing.id, data) : db.insert('broadcasts', data);
    if (send && data.schedule === 'now') {
      B.sendBroadcast(b.id).catch((e) => console.error('broadcast', e));
      return H.redirect(res, `${base(ctx.acc)}/${b.id}`, 'بلّش الإرسال — الرسالة بتوصل على دفعات.');
    }
    H.redirect(res, base(ctx.acc), data.status === 'scheduled' ? 'انجدولت الرسالة' : 'انحفظت كمسودة');
  });
};
