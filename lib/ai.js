// شفق AI: توليد نصوص (Claude أو OpenAI) وصور (OpenAI) — الرصيد بيتحسب بعدد التوكنات
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('./db');
const P = require('./plans');

class AiError extends Error {}

function config() {
  const s = P.settings();
  return {
    provider: process.env.AI_PROVIDER || s.aiProvider || 'anthropic',
    anthropicKey: process.env.ANTHROPIC_API_KEY || s.aiKey,
    anthropicModel: process.env.AI_MODEL || s.aiModel || 'claude-haiku-5-5',
    openaiKey: process.env.OPENAI_API_KEY || s.openaiKey,
    openaiModel: s.openaiModel || 'gpt-4o-mini',
    imageModel: s.imageModel || 'gpt-image-1',
  };
}

const textReady = () => { const c = config(); return Boolean(c.provider === 'openai' ? c.openaiKey : c.anthropicKey); };
const imageReady = () => Boolean(config().openaiKey);

const BRAND = 'إنت كاتب محتوى عربي محترف لحسابات سوشال ميديا. اكتب بلهجة شامية طبيعية وقريبة إلا إذا انطلب غير هيك. بدون مقدمات أو شرح — بس المطلوب.';

async function complete(tenant, { system, prompt, maxTokens = 600 }) {
  if (!textReady()) throw new AiError('ميزة الذكاء مو مفعّلة لسا على المنصة (ناقص مفتاح API).');
  if (P.aiBalance(tenant) <= 0) throw new AiError('خلص رصيد شفق AI لهالشهر. فيك تطلب رصيد إضافي أو ترقّي الباقة.');
  const c = config();
  let text = '';
  let used = 0;
  if (c.provider === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: c.openaiModel, max_tokens: maxTokens, messages: [{ role: 'system', content: system || BRAND }, { role: 'user', content: prompt }] }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new AiError(j.error?.message || `OpenAI ${r.status}`);
    text = j.choices?.[0]?.message?.content || '';
    used = (j.usage?.prompt_tokens || 0) + (j.usage?.completion_tokens || 0);
  } else {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': c.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: c.anthropicModel, max_tokens: maxTokens, system: system || BRAND, messages: [{ role: 'user', content: prompt }] }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new AiError(j.error?.message || `Claude ${r.status}`);
    text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    used = (j.usage?.input_tokens || 0) + (j.usage?.output_tokens || 0);
  }
  P.useAi(tenant, used || Math.ceil((prompt.length + text.length) / 3));
  return text.trim();
}

const splitLines = (t) => t.split('\n').map((x) => x.replace(/^\s*(\d+[.)-]|[-•*])\s*/, '').trim()).filter(Boolean);

// منشور / كابشن
async function caption(tenant, { topic, tone = 'حماسي', platform = 'إنستغرام', length = 'متوسط', hashtags = true, emoji = false, count = 3, brand = '' }) {
  const prompt = `اكتب ${count} نسخ مختلفة لكابشن منشور على ${platform}.
الموضوع: ${topic}
${brand ? `عن الصفحة: ${brand}\n` : ''}الأسلوب: ${tone}. الطول: ${length}. ${emoji ? 'فيك تستخدم إيموجي خفيف.' : 'بدون إيموجي نهائياً.'} ${hashtags ? 'ضيف 3-6 هاشتاغات مناسبة بالآخر.' : 'بدون هاشتاغات.'}
افصل بين كل نسخة والتانية بسطر فيه ---`;
  const out = await complete(tenant, { prompt, maxTokens: 1200 });
  return out.split(/\n-{3,}\n?/).map((x) => x.trim()).filter(Boolean).slice(0, count);
}

// ردود علنية على التعليقات (صيغ متنوعة)
async function commentReplies(tenant, { context = '', count = 6 }) {
  const prompt = `اكتب ${count} صيغ قصيرة ومختلفة لرد علني تحت تعليقات زباين على منشور، كلها بتقول إنو بعتنالهم التفاصيل عالخاص.
${context ? `المنشور أو المنتج: ${context}\n` : ''}كل رد بسطر لحاله، لحد 12 كلمة، بدون إيموجي. فيك تستخدم {name} مكان اسم الشخص ببعضها. بدون ترقيم.`;
  return splitLines(await complete(tenant, { prompt, maxTokens: 500 })).slice(0, count);
}

// المساعد الذكي: رد على رسالة زبون حسب معلومات الصفحة
async function assistantReply(tenant, acc, { text, name = '' }) {
  const a = acc.assistant || {};
  const system = `إنت مساعد خدمة زبائن لصفحة "${acc.name}" على السوشال ميديا. أسلوبك: ${a.tone || 'ودود ومختصر'}.
جاوب بالعربي وبنفس لهجة الزبون، بجملتين لتلات جمل بالكتير.
اعتمد بس على المعلومات التالية عن الصفحة، وإذا السؤال برّاها أو ما بتعرف الجواب، جاوب بالضبط: "${a.handoff || 'رح يرد عليك حدا من الفريق بأقرب وقت'}"
لا تخترع أسعار أو مواعيد أو وعود.

معلومات الصفحة:
${a.about || '(ما في معلومات)'}`;
  return complete(tenant, { system, prompt: `${name ? `اسم الزبون: ${name}\n` : ''}رسالة الزبون: ${text}`, maxTokens: 350 });
}

// توليد صورة (OpenAI) ← بتنحفظ بالرفع
async function image(tenant, { prompt, size = '1024x1024' }) {
  const c = config();
  if (!c.openaiKey) throw new AiError('توليد الصور بدّه مفتاح OpenAI بإعدادات المنصة.');
  if (P.aiBalance(tenant) <= 0) throw new AiError('خلص رصيد شفق AI لهالشهر.');
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: c.imageModel, prompt, size, n: 1 }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new AiError(j.error?.message || `OpenAI ${r.status}`);
  const item = j.data?.[0] || {};
  let buf;
  if (item.b64_json) buf = Buffer.from(item.b64_json, 'base64');
  else if (item.url) buf = Buffer.from(await (await fetch(item.url)).arrayBuffer());
  else throw new AiError('ما رجعت صورة');
  fs.mkdirSync(db.UPLOADS, { recursive: true });
  const name = `ai-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.png`;
  fs.writeFileSync(path.join(db.UPLOADS, name), buf);
  P.useAi(tenant, 20000); // الصورة الوحدة = 20,000 رصيد
  return `/uploads/${name}`;
}

module.exports = { AiError, textReady, imageReady, complete, caption, commentReplies, assistantReply, image };
