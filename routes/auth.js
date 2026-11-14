// فريق الإدارة + حسابي
const db = require('../lib/db');
const auth = require('../lib/auth');
const H = require('../lib/http');
const core = require('../views/core');

module.exports = (r) => {
  r.get('/team', (req, res, { ctx }) => H.send(res, 200, core.teamPage(ctx, db.where('users', (u) => u.tenantId === ctx.tenant.id))), { admin: true });

  r.post('/team', async (req, res, { form, ctx }) => {
    const { fields } = await form();
    try {
      auth.createUser({ ...fields, role: fields.role === 'editor' ? 'editor' : 'admin', tenantId: ctx.tenant.id });
      H.redirect(res, '/team', `انضاف ${fields.username}`);
    } catch (err) {
      H.redirect(res, '/team', err.message);
    }
  }, { admin: true });

  r.post('/team/:id/delete', (req, res, { params, ctx }) => {
    if (params.id === ctx.user.id) return H.redirect(res, '/team', 'ما فيك تحذف حالك.');
    const target = db.get('users', params.id);
    if (!target || target.tenantId !== ctx.tenant.id || target.role === 'super') return H.redirect(res, '/team');
    const admins = db.where('users', (u) => u.tenantId === ctx.tenant.id && ['admin', 'super'].includes(u.role));
    if (target.role === 'admin' && admins.length <= 1) return H.redirect(res, '/team', 'لازم يضل مدير واحد على الأقل.');
    db.remove('users', params.id);
    H.redirect(res, '/team', 'انحذف العضو.');
  }, { admin: true });

  r.get('/me', (req, res, { ctx }) => H.send(res, 200, core.mePage(ctx)), { always: true });

  r.post('/me/name', async (req, res, { ctx, form }) => {
    const { fields } = await form();
    db.update('users', ctx.user.id, { name: String(fields.name || '').trim().slice(0, 60) });
    H.redirect(res, '/me', 'انحفظ');
  }, { always: true });

  r.post('/me/password', async (req, res, { ctx, form }) => {
    const { fields } = await form();
    if (!auth.checkPassword(ctx.user, fields.current || '')) return H.redirect(res, '/me', 'كلمة السر الحالية غلط.');
    try {
      const u = auth.setPassword(ctx.user.id, fields.password);
      H.addCookie(res, H.cookie('sid', auth.makeSession(u), { maxAge: auth.SESSION_DAYS * 86400 }));
      H.redirect(res, '/me', 'تغيّرت كلمة السر — الأجهزة التانية لازم تسجّل دخول من جديد.');
    } catch (err) {
      H.redirect(res, '/me', err.message);
    }
  }, { always: true });

  r.get('/install', (req, res, { ctx }) => {
    H.send(res, 200, core.installPage(ctx));
  }, { always: true });
};
