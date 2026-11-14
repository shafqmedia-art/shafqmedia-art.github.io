// الباقات والميزات وحالة اشتراك كل زبون
const db = require('./db');

const PERIODS = { m1: 'شهر', m3: '3 أشهر', m6: '6 أشهر', m12: 'سنوي' };
const PERIOD_MONTHS = { m1: 1, m3: 3, m6: 6, m12: 12 };
const PLATFORMS = { fb: 'فيسبوك', fbig: 'فيسبوك + إنستغرام' };

// مزايا الباقات بالترتيب اللي بيطلع بجدول الأسعار
// type: bool (✓/✕) | text (قيمة مكتوبة) | credits (رصيد)
const FEATURES = [
  { key: 'unlimitedComments', label: 'ردود على التعليقات والدايركت بلا حد', type: 'bool', group: 'الردود التلقائية' },
  { key: 'multiReplies', label: 'كذا صيغة للرد العلني', type: 'bool' },
  { key: 'autoLike', label: 'لايك تلقائي على التعليق', type: 'bool' },
  { key: 'likeRequired', label: 'الرد بس على اللي عامل لايك للمنشور', type: 'bool' },
  { key: 'richDm', label: 'شكل الرسالة الخاصة', type: 'text', off: 'نص', on: 'نص + صور + أزرار + معرض' },
  { key: 'reelsStory', label: 'الرد على الستوري والريلز', type: 'bool' },
  { key: 'badWords', label: 'إخفاء التعليقات المسيئة', type: 'bool' },
  { key: 'messengerBot', label: 'مسارات محادثة بأزرار وقائمة ثابتة', type: 'bool', group: 'المحادثة والمبيعات' },
  { key: 'broadcast', label: 'حملات رسائل للمتابعين', type: 'bool' },
  { key: 'store', label: 'متجر داخل الرسائل + استقبال طلبات', type: 'bool' },
  { key: 'ai', label: 'رصيد شفق AI الشهري', type: 'credits', group: 'شفق AI' },
  { key: 'aiImages', label: 'تصميم صور بالذكاء', type: 'bool' },
  { key: 'aiAssistant', label: 'مساعد بيرد على الرسائل من معلومات صفحتك', type: 'bool' },
  { key: 'publish', label: 'نشر وجدولة المنشورات', type: 'bool', group: 'المحتوى والتقارير' },
  { key: 'reels', label: 'نشر فيديو وريلز', type: 'bool' },
  { key: 'stats', label: 'الإحصائيات', type: 'text', off: '—', on: 'لوحة عامة', onMax: 'لكل منشور' },
  { key: 'detailedReports', label: 'تصدير التقارير', type: 'bool' },
];

const DEFAULT_PLANS = [
  {
    id: 'lite', name: 'شفق لايت', tagline: 'ردود تلقائية نصية — بداية خفيفة', order: 0, highlight: false,
    pages: 1, aiCredits: 0,
    features: { unlimitedComments: true, richDm: false, autoLike: true, multiReplies: true, likeRequired: true },
  },
  {
    id: 'pro', name: 'شفق برو', tagline: 'كل أدوات التفاعل والمحتوى والذكاء', order: 1, highlight: true,
    pages: 1, aiCredits: 250000,
    features: {
      unlimitedComments: true, richDm: true, autoLike: true, multiReplies: true, likeRequired: true,
      reelsStory: true, messengerBot: true, broadcast: true, publish: true, reels: true, stats: true, ai: true, aiImages: true, badWords: true,
    },
  },
  {
    id: 'max', name: 'شفق ماكس', tagline: 'للبزنس اللي بيبيع: متجر، مساعد، صفحتين', order: 2, highlight: false,
    pages: 2, aiCredits: 1000000, statsDetailed: true,
    features: {
      unlimitedComments: true, richDm: true, autoLike: true, multiReplies: true, likeRequired: true,
      reelsStory: true, messengerBot: true, broadcast: true, publish: true, reels: true, stats: true, detailedReports: true,
      ai: true, aiImages: true, aiAssistant: true, badWords: true, store: true,
    },
  },
];

function ensurePlans() {
  const plans = db.all('plans');
  if (!plans.length) {
    for (const p of DEFAULT_PLANS) plans.push({ ...structuredClone(p), prices: { fb: {}, fbig: {} }, active: true, createdAt: Date.now(), updatedAt: Date.now() });
    db.save();
  }
}

const listPlans = (all = false) => db.all('plans').filter((p) => all || p.active !== false).sort((a, b) => a.order - b.order);
const getPlan = (id) => db.get('plans', id);

const DEFAULT_SETTINGS = {
  platformName: 'شفق بوت', signupOpen: true, trialDays: 7, trialPlan: 'pro',
  paymentInfo: 'حوّل قيمة الباقة على أحد الحسابات التالية، وارفع صورة الإشعار أو رقم العملية:\n• شام كاش: ...\n• الهرم / الفؤاد: ...\n• واتساب للاستفسار: +966563079286',
  supportWhatsapp: '+966563079286', bonusSecondPage: true, currency: 'USD',
  aiProvider: 'anthropic', aiModel: 'claude-haiku-5-5', aiKey: '', openaiKey: '', openaiModel: 'gpt-4o-mini', imageModel: 'gpt-image-1',
};
const settings = () => ({ ...DEFAULT_SETTINGS, ...db.settings() });

// ---------- حالة الزبون ----------
// house = حساب شفق ميديا نفسها (كل شي مفتوح دايماً)
function status(t) {
  if (!t) return 'none';
  if (t.house) return 'active';
  if (t.status === 'suspended') return 'suspended';
  const now = Date.now();
  if (t.expiresAt && now <= t.expiresAt) return 'active';
  if (!t.expiresAt && t.trialEndsAt && now <= t.trialEndsAt) return 'trial';
  return 'expired';
}

const STATUS_LABEL = { active: 'فعّال', trial: 'فترة تجربة', expired: 'منتهي', suspended: 'موقوف', none: '—' };
const isLive = (t) => ['active', 'trial'].includes(status(t));

function effectivePlan(t) {
  if (!t) return null;
  if (t.house) return { ...(getPlan('max') || DEFAULT_PLANS[2]), features: Object.fromEntries(FEATURES.map((f) => [f.key, true])), pages: 999, aiCredits: 1e9, statsDetailed: true };
  const st = status(t);
  if (st === 'trial') return getPlan(settings().trialPlan) || getPlan(t.planId);
  return getPlan(t.planId);
}

// هل الميزة متاحة للزبون؟
function can(t, feature) {
  if (!t) return false;
  if (t.house) return true;
  if (!isLive(t)) return false;
  return Boolean(effectivePlan(t)?.features?.[feature]);
}

// عدد الصفحات المسموح: صفحة فيسبوك (+ إنستغرامها إذا الباقة فيسبوك + إنستغرام)
function pageLimit(t) {
  if (t?.house) return 999;
  const plan = effectivePlan(t);
  let n = Number(plan?.pages) || 1;
  if (t?.bonusPage) n += 1;
  return n + (Number(t?.extraPages) || 0);
}

const allowsInstagram = (t) => t?.house || status(t) === 'trial' || t?.platforms === 'fbig';

// رصيد الذكاء: شهري حسب الباقة + أي رصيد إضافي
const monthKey = () => new Date().toISOString().slice(0, 7);
function aiBalance(t) {
  if (!t) return 0;
  if (t.house) return Infinity;
  if (!can(t, 'ai')) return 0;
  const plan = effectivePlan(t);
  const used = t.aiUsage?.[monthKey()] || 0;
  return Math.max(0, (Number(plan?.aiCredits) || 0) + (Number(t.aiExtra) || 0) - used);
}

function useAi(t, n) {
  if (!t || t.house) return;
  t.aiUsage ||= {};
  t.aiUsage[monthKey()] = (t.aiUsage[monthKey()] || 0) + n;
  db.saveSoon();
}

function price(plan, platforms, period) {
  const v = Number(plan?.prices?.[platforms]?.[period]);
  return v > 0 ? v : 0;
}

module.exports = {
  PERIODS, PERIOD_MONTHS, PLATFORMS, FEATURES, DEFAULT_PLANS, STATUS_LABEL, DEFAULT_SETTINGS,
  ensurePlans, listPlans, getPlan, settings, status, isLive, effectivePlan, can, pageLimit, allowsInstagram,
  aiBalance, useAi, price, monthKey,
};
