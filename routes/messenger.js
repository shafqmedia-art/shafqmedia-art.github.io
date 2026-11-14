// بوت المحادثة: الإعدادات (ترحيب، زر "ابدأ"، القائمة) + المجموعات والبلوكات
const db = require('../lib/db');
const H = require('../lib/http');
const meta = require('../lib/meta');
const M = require('../lib/messages');
const V = require('../views/messenger');
const { specFrom } = require('./replies');

const byOrder = (a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || a.createdAt - b.createdAt;
const groupsOf = (acc) => db.where('groups', (g) => g.accountId === acc.id).sort(byOrder);
const blocksOf = (acc) => db.where('blocks', (b) => b.accountId === acc.id).sort(byOrder);

function blocksWithGroup(acc) {
  const groups = Object.fromEntries(groupsOf(acc).map((g) => [g.id, g.name]));
  return blocksOf(acc).map((b) => ({ ...b, groupName: groups[b.groupId] || '' }));
}

function menuPayload(acc, it) {
  if (it.type === 'url') return { type: 'web_url', title: it.title, url: M.absUrl(it.target) };
  if (it.target === 'STORE') return { type: 'postback', title: it.title, payload: 'STORE' };
  return { type: 'postback', title: it.title, payload: `BLOCK:${it.target}` };
}

module.exports = (r) => {
  const sbase = (acc) => `/a/${acc.id}/messenger`;
  const bbase = (acc) => `/a/${acc.id}/blocks`;

  // ---- الإعدادات ----
  r.get('/a/:acc/messenger', (req, res, { ctx, query }) => H.send(res, 200, V.settingsPage(ctx, { blocks: blocksWithGroup(ctx.acc), tab: query.tab })));

  r.post('/a/:acc/messenger/greeting', async (req, res, { ctx, form }) => {
    const { fields } = await form();
    const greeting = String(fields.greeting || '').trim().slice(0, 160);
    db.updateAccount(ctx.acc.id, { messenger: { ...ctx.acc.messenger, greeting } });
    try {
      await meta.setMessengerProfile(ctx.acc, { greeting: [{ locale: 'default', text: greeting || ' ' }] });
      H.redirect(res, `${sbase(ctx.acc)}?tab=greeting`, 'تم تحديث رسالة الترحيب');
    } catch (err) {
      H.redirect(res, `${sbase(ctx.acc)}?tab=greeting`, `انحفظت هون، بس Meta رفضت: ${err.message}`);
    }
  });

  r.post('/a/:acc/messenger/start', async (req, res, { ctx, form }) => {
    const { fields } = await form();
    db.updateAccount(ctx.acc.id, { messenger: { ...ctx.acc.messenger, getStartedBlock: fields.getStartedBlock || '' } });
    try {
      await meta.setMessengerProfile(ctx.acc, { get_started: { payload: 'GET_STARTED' } });
      H.redirect(res, `${sbase(ctx.acc)}?tab=start`, 'انربط زر "ابدأ"');
    } catch (err) {
      H.redirect(res, `${sbase(ctx.acc)}?tab=start`, `انحفظ هون، بس Meta رفضت: ${err.message}`);
    }
  });

  const menuItem = (f) => ({
    title: String(f.title || '').trim().slice(0, 20),
    type: f.type === 'url' ? 'url' : 'block',
    target: f.type === 'url' ? String(f.url || '').trim() : f.target || '',
  });

  r.post('/a/:acc/messenger/menu', async (req, res, { ctx, form }) => {
    const { fields } = await form();
    const it = menuItem(fields);
    const menu = [...(ctx.acc.messenger.menu || [])];
    if (!it.title || !it.target) return H.redirect(res, `${sbase(ctx.acc)}?tab=menu`, 'لازم عنوان ووجهة للزر.');
    if (menu.length >= 20) return H.redirect(res, `${sbase(ctx.acc)}?tab=menu`, 'الحد الأقصى 20 زر.');
    menu.push(it);
    db.updateAccount(ctx.acc.id, { messenger: { ...ctx.acc.messenger, menu } });
    H.redirect(res, `${sbase(ctx.acc)}?tab=menu`, 'انضاف الزر — لا تنسى "تحديث القائمة".');
  });

  r.post('/a/:acc/messenger/menu/:i/delete', (req, res, { ctx, params }) => {
    const menu = (ctx.acc.messenger.menu || []).filter((_, i) => i !== Number(params.i));
    db.updateAccount(ctx.acc.id, { messenger: { ...ctx.acc.messenger, menu } });
    H.redirect(res, `${sbase(ctx.acc)}?tab=menu`, 'انحذف الزر.');
  });

  r.post('/a/:acc/messenger/menu/:i', async (req, res, { ctx, params, form }) => {
    const { fields } = await form();
    const menu = [...(ctx.acc.messenger.menu || [])];
    if (menu[Number(params.i)]) menu[Number(params.i)] = menuItem(fields);
    db.updateAccount(ctx.acc.id, { messenger: { ...ctx.acc.messenger, menu } });
    H.redirect(res, `${sbase(ctx.acc)}?tab=menu`, 'انحفظ الزر.');
  });

  r.post('/a/:acc/messenger/publish', async (req, res, { ctx }) => {
    const acc = ctx.acc;
    const items = (acc.messenger.menu || []).filter((it) => it.title && it.target).map((it) => menuPayload(acc, it));
    try {
      if (!items.length) {
        await meta.graph('DELETE', '/me/messenger_profile', { token: acc.token, params: acc.platform === 'instagram' ? { platform: 'instagram' } : {}, body: { fields: ['persistent_menu'] } });
      } else {
        const profile = { persistent_menu: [{ locale: 'default', composer_input_disabled: false, call_to_actions: items }] };
        if (acc.platform === 'facebook') profile.get_started = { payload: 'GET_STARTED' };
        await meta.setMessengerProfile(acc, profile);
      }
      db.updateAccount(acc.id, { messenger: { ...acc.messenger, publishedAt: Date.now() } });
      H.redirect(res, `${sbase(acc)}?tab=menu`, 'انتشرت القائمة (ممكن تاخد شوي لتبين عند الناس)');
    } catch (err) {
      H.redirect(res, `${sbase(acc)}?tab=menu`, `Meta رفضت تحديث القائمة: ${err.message}`);
    }
  });

  // ---- المجموعات والبلوكات ----
  r.get('/a/:acc/blocks', (req, res, { ctx, query }) => {
    const blocks = blocksOf(ctx.acc);
    const current = blocks.find((b) => b.id === query.b) || null;
    H.send(res, 200, V.blocksPage(ctx, { groups: groupsOf(ctx.acc), blocks, current }));
  });

  r.post('/a/:acc/blocks/groups', (req, res, { ctx }) => {
    const n = groupsOf(ctx.acc).length;
    const g = db.insert('groups', { accountId: ctx.acc.id, name: n ? `مسار ${n + 1}` : 'الترحيب', order: n });
    const b = db.insert('blocks', { accountId: ctx.acc.id, groupId: g.id, name: 'خطوة جديدة', items: [], order: 0 });
    H.redirect(res, `${bbase(ctx.acc)}?b=${b.id}`, 'انضاف مسار جديد — سمّيه.');
  });

  const ownGroup = (ctx, id) => { const g = db.get('groups', id); return g?.accountId === ctx.acc.id ? g : null; };
  const ownBlock = (ctx, id) => { const b = db.get('blocks', id); return b?.accountId === ctx.acc.id ? b : null; };

  r.post('/a/:acc/blocks/groups/:id', async (req, res, { ctx, params, form }) => {
    const { fields } = await form();
    if (ownGroup(ctx, params.id)) db.update('groups', params.id, { name: String(fields.name || '').trim().slice(0, 60) || 'مسار' });
    H.redirect(res, bbase(ctx.acc));
  });

  r.post('/a/:acc/blocks/groups/:id/delete', (req, res, { ctx, params }) => {
    if (ownGroup(ctx, params.id)) {
      db.removeWhere('blocks', (b) => b.groupId === params.id);
      db.remove('groups', params.id);
    }
    H.redirect(res, bbase(ctx.acc), 'انحذف المسار.');
  });

  r.post('/a/:acc/blocks/groups/:id/copy', (req, res, { ctx, params }) => {
    const g = ownGroup(ctx, params.id);
    if (g) {
      const ng = db.insert('groups', { accountId: ctx.acc.id, name: `${g.name} (نسخة)`, order: groupsOf(ctx.acc).length });
      for (const b of blocksOf(ctx.acc).filter((x) => x.groupId === g.id)) {
        db.insert('blocks', { accountId: ctx.acc.id, groupId: ng.id, name: b.name, items: structuredClone(b.items || []), order: b.order });
      }
    }
    H.redirect(res, bbase(ctx.acc), 'انعملت نسخة من المسار.');
  });

  r.post('/a/:acc/blocks/groups/:id/blocks', (req, res, { ctx, params }) => {
    if (!ownGroup(ctx, params.id)) return H.redirect(res, bbase(ctx.acc));
    const n = blocksOf(ctx.acc).filter((b) => b.groupId === params.id).length;
    const b = db.insert('blocks', { accountId: ctx.acc.id, groupId: params.id, name: 'خطوة جديدة', items: [], order: n });
    H.redirect(res, `${bbase(ctx.acc)}?b=${b.id}`);
  });

  r.post('/a/:acc/blocks/:id/copy', (req, res, { ctx, params }) => {
    const b = ownBlock(ctx, params.id);
    if (!b) return H.redirect(res, bbase(ctx.acc));
    const nb = db.insert('blocks', { accountId: ctx.acc.id, groupId: b.groupId, name: `${b.name} (نسخة)`, items: structuredClone(b.items || []), order: (b.order || 0) + 1 });
    H.redirect(res, `${bbase(ctx.acc)}?b=${nb.id}`, 'انعملت نسخة من الخطوة.');
  });

  r.post('/a/:acc/blocks/:id/delete', (req, res, { ctx, params }) => {
    if (ownBlock(ctx, params.id)) db.remove('blocks', params.id);
    H.redirect(res, bbase(ctx.acc), 'انحذفت الخطوة.');
  });

  r.post('/a/:acc/blocks/:id', async (req, res, { ctx, params, form }) => {
    const b = ownBlock(ctx, params.id);
    if (!b) return H.redirect(res, bbase(ctx.acc));
    const { fields } = await form();
    const groupId = ownGroup(ctx, fields.groupId) ? fields.groupId : b.groupId;
    db.update('blocks', b.id, { name: String(fields.name || '').trim().slice(0, 60) || 'خطوة جديدة', groupId, items: specFrom(fields.items).items });
    H.redirect(res, `${bbase(ctx.acc)}?b=${b.id}`, 'تم الحفظ');
  });
};
