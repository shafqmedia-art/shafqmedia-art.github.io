// إدارة المحتوى + التقارير التفصيلية والتصدير
const db = require('../lib/db');
const H = require('../lib/http');
const P = require('../lib/plans');
const C = require('../lib/content');
const V = require('../views/ai');

module.exports = (r) => {
  const base = (acc) => `/a/${acc.id}/content`;

  r.get('/a/:acc/content', (req, res, { ctx }) => {
    const posts = db.where('posts', (p) => p.accountId === ctx.acc.id).sort((a, b) => b.createdAt - a.createdAt);
    H.send(res, 200, V.contentPage(ctx, posts));
  });

  r.get('/a/:acc/content/new', (req, res, { ctx, query }) => H.send(res, 200, V.contentForm(ctx, { text: query.text || '', media: query.media || '' })));

  r.post('/a/:acc/content/new', async (req, res, { ctx, form }) => {
    const { fields: f } = await form();
    const back = (error) => H.send(res, 400, V.contentForm(ctx, { text: f.text, media: f.media, error }));
    let mediaType = ['image', 'video', 'none'].includes(f.mediaType) ? f.mediaType : 'image';
    if (mediaType === 'video' && !P.can(ctx.tenant, 'reels')) return back('الفيديو والريلز مو ضمن باقتك.');
    const media = mediaType === 'none' ? '' : f.media || '';
    if (!media) mediaType = 'none';
    if (ctx.acc.platform === 'instagram' && !media) return back('إنستغرام بدّه صورة أو فيديو.');
    if (!String(f.text || '').trim() && !media) return back('اكتب نص أو ارفع صورة.');
    let publishAt = null;
    if (f.when === 'later') {
      publishAt = f.publishAt;
      const t = new Date(publishAt).getTime();
      if (!publishAt || !(t > Date.now() + 60e3)) return back('اختار وقت بالمستقبل.');
      if (ctx.acc.platform === 'facebook' && t < Date.now() + 11 * 60e3) return back('فيسبوك بيجدول بعد 10 دقايق على الأقل.');
    }
    const post = db.insert('posts', {
      tenantId: ctx.tenant.id, accountId: ctx.acc.id, text: String(f.text || '').slice(0, 2200), media, mediaType: mediaType === 'none' ? '' : mediaType,
      publishAt, status: publishAt ? 'scheduled' : 'publishing', userId: ctx.user.id,
    });
    // فيسبوك بيستلم المنشور هلق (حتى لو مجدول)، وإنستغرام المجدول بيضل عنا لوقته
    if (!publishAt || ctx.acc.platform === 'facebook') {
      await C.publish(post);
      const p = db.get('posts', post.id);
      return H.redirect(res, base(ctx.acc), p.status === 'failed' ? `ما انتشر: ${p.error}` : p.status === 'scheduled' ? 'انجدول المنشور' : 'انتشر المنشور');
    }
    H.redirect(res, base(ctx.acc), 'انجدول المنشور — رح ينتشر عالوقت.');
  });

  r.post('/a/:acc/content/:id/delete', (req, res, { ctx, params }) => {
    const p = db.get('posts', params.id);
    if (p?.accountId === ctx.acc.id && !p.fbScheduled) db.remove('posts', p.id);
    H.redirect(res, base(ctx.acc), 'انحذف.');
  });

  r.post('/a/:acc/content/:id/retry', async (req, res, { ctx, params }) => {
    const p = db.get('posts', params.id);
    if (p?.accountId === ctx.acc.id && p.status === 'failed') await C.publish(p);
    H.redirect(res, base(ctx.acc), db.get('posts', params.id)?.status === 'failed' ? 'لسا ما زبط' : 'انتشر');
  });

  // ---- تصدير التقارير (تقارير تفصيلية) ----
  r.get('/a/:acc/reports/export.csv', (req, res, { ctx, query }) => {
    if (!P.can(ctx.tenant, 'detailedReports')) return H.redirect(res, `/a/${ctx.acc.id}/reports`, 'التصدير ضمن باقة ماكس.');
    const cell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; }; // يمنع حقن معادلات الإكسل
    let rows;
    if (query.type === 'orders') {
      rows = [['number', 'name', 'date', 'status', 'total', 'items']].concat(db.where('orders', (o) => o.accountId === ctx.acc.id)
        .map((o) => [o.number, o.name, new Date(o.createdAt).toISOString(), o.status, o.total, o.items.map((i) => `${i.name} x${i.qty}`).join(' | ')]));
    } else {
      rows = [['date', 'kind', 'text', 'result', 'rule', 'post', 'error']].concat(db.listLogs(ctx.acc.id)
        .map((l) => [new Date(l.at).toISOString(), l.kind, l.text, l.result, l.rule, l.postId, l.error]));
    }
    H.send(res, 200, `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}`, {
      'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${query.type === 'orders' ? 'orders' : 'activity'}.csv"`,
    });
  });
};
