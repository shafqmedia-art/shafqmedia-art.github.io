// شفق AI + فلترة الكلمات
const db = require('../lib/db');
const H = require('../lib/http');
const ai = require('../lib/ai');
const V = require('../views/ai');

const errMsg = (e) => (e instanceof ai.AiError ? e.message : `صار خطأ: ${e.message}`);

module.exports = (r) => {
  r.get('/a/:acc/ai', (req, res, { ctx }) => H.send(res, 200, V.captionPage(ctx, { ready: ai.textReady() })));
  r.post('/a/:acc/ai/caption', async (req, res, { ctx, form }) => {
    const { fields: f } = await form();
    try {
      const results = await ai.caption(ctx.tenant, { topic: String(f.topic || '').slice(0, 1000), tone: f.tone, platform: f.platform, length: f.length, hashtags: f.hashtags === 'on', emoji: f.emoji === 'on', count: Math.min(4, Number(f.count) || 3), brand: String(f.brand || '').slice(0, 200) });
      H.send(res, 200, V.captionPage(ctx, { ready: true, results, values: f }));
    } catch (e) {
      H.send(res, 200, V.captionPage(ctx, { ready: ai.textReady(), values: f, error: errMsg(e) }));
    }
  });

  r.get('/a/:acc/ai/replies', (req, res, { ctx }) => H.send(res, 200, V.repliesPage(ctx, { ready: ai.textReady() })));
  r.post('/a/:acc/ai/replies', async (req, res, { ctx, form }) => {
    const { fields: f } = await form();
    try {
      const results = await ai.commentReplies(ctx.tenant, { context: String(f.context || '').slice(0, 300) });
      H.send(res, 200, V.repliesPage(ctx, { ready: true, results, context: f.context }));
    } catch (e) {
      H.send(res, 200, V.repliesPage(ctx, { ready: ai.textReady(), context: f.context, error: errMsg(e) }));
    }
  });
  // لزر "توليد بالذكاء" بفورم الرد التلقائي
  r.post('/a/:acc/ai/replies.json', async (req, res, { ctx, form }) => {
    const { fields: f } = await form();
    try {
      H.json(res, { replies: await ai.commentReplies(ctx.tenant, { context: String(f.context || '').slice(0, 300) }) });
    } catch (e) {
      H.json(res, { error: errMsg(e) }, 400);
    }
  });

  r.get('/a/:acc/ai/images', (req, res, { ctx }) => H.send(res, 200, V.imagesPage(ctx, { ready: ai.imageReady() })));
  r.post('/a/:acc/ai/images', async (req, res, { ctx, form }) => {
    const { fields: f } = await form();
    const size = ['1024x1024', '1024x1536', '1536x1024'].includes(f.size) ? f.size : '1024x1024';
    try {
      const url = await ai.image(ctx.tenant, { prompt: String(f.prompt || '').slice(0, 1000), size });
      H.send(res, 200, V.imagesPage(ctx, { ready: true, url, prompt: f.prompt }));
    } catch (e) {
      H.send(res, 200, V.imagesPage(ctx, { ready: ai.imageReady(), prompt: f.prompt, error: errMsg(e) }));
    }
  });

  r.get('/a/:acc/ai/assistant', (req, res, { ctx }) => H.send(res, 200, V.assistantPage(ctx, { ready: ai.textReady() })));
  r.post('/a/:acc/ai/assistant/test', async (req, res, { ctx, form }) => {
    const { fields: f } = await form();
    try {
      const answer = await ai.assistantReply(ctx.tenant, ctx.acc, { text: String(f.text || '').slice(0, 500) });
      H.send(res, 200, V.assistantPage(ctx, { ready: true, test: f.text, answer }));
    } catch (e) {
      H.send(res, 200, V.assistantPage(ctx, { ready: ai.textReady(), test: f.text, error: errMsg(e) }));
    }
  });
  r.post('/a/:acc/ai/assistant', async (req, res, { ctx, form }) => {
    const { fields: f } = await form();
    db.updateAccount(ctx.acc.id, { assistant: {
      enabled: f.enabled === 'on', about: String(f.about || '').slice(0, 6000),
      tone: String(f.tone || '').slice(0, 100), handoff: String(f.handoff || '').slice(0, 300),
    } });
    H.redirect(res, `/a/${ctx.acc.id}/ai/assistant`, 'انحفظ المساعد');
  });

  // ---- فلترة الكلمات ----
  r.get('/a/:acc/badwords', (req, res, { ctx }) => H.send(res, 200, V.badWordsPage(ctx)));
  r.post('/a/:acc/badwords', async (req, res, { ctx, form }) => {
    const { fields: f } = await form();
    let words = [];
    try { words = JSON.parse(f.words || '[]'); } catch { words = String(f.words || '').split(/[,،\n]/); }
    db.updateAccount(ctx.acc.id, { badWords: {
      enabled: f.enabled === 'on', action: f.action === 'delete' && ctx.acc.platform === 'facebook' ? 'delete' : 'hide',
      words: words.map((w) => String(w).trim()).filter(Boolean).slice(0, 500),
    } });
    H.redirect(res, `/a/${ctx.acc.id}/badwords`, 'انحفظت الفلترة');
  });
};
