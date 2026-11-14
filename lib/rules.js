// مطابقة الرسائل والتعليقات مع القواعد

// توحيد الكتابة العربية: أ إ آ ← ا، ة ← ه، ى ← ي، وشيل التشكيل والتطويل
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

// هل الكلمات بتطابق؟ (إذا ما في كلمات ← بيطابق كل شي)
function keywordsMatch(keywords, text, match = 'contains') {
  const keys = (keywords || []).map(normalize).filter(Boolean);
  if (!keys.length) return true;
  const msg = normalize(text);
  if (!msg) return false;
  return keys.some((k) => (match === 'exact' ? msg === k : msg.includes(k)));
}

// هل القاعدة شغّالة هلق؟ status: active | inactive | scheduled (ضمن فترة)
function isActive(rule, now = Date.now()) {
  if (rule.enabled === false) return false;
  const st = rule.status || 'active';
  if (st === 'inactive') return false;
  if (st === 'scheduled') {
    if (rule.from && now < new Date(rule.from).getTime()) return false;
    if (rule.to && now > new Date(rule.to).getTime()) return false;
  }
  return true;
}

// kind: "dm" | "comment" — ctx: { postId }
// rule.on: dm | comment | both — rule.scope: all | post | newpost
function findRule(rules, text, kind, ctx = {}) {
  if (!normalize(text) && kind === 'dm') return null;
  for (const rule of rules || []) {
    if (!isActive(rule)) continue;
    const on = rule.on || 'both';
    if (on !== 'both' && on !== kind) continue;
    if (kind === 'comment' && rule.scope && rule.scope !== 'all') {
      if (!rule.postId || String(rule.postId) !== String(ctx.postId || '')) continue;
    }
    // بالدايركت لازم يكون في كلمات (وإلا كل رسالة بتطابق) — الرد العام للرسائل إله إعداد لحاله
    if (kind === 'dm' && !(rule.keywords || []).some((k) => normalize(k))) continue;
    if (keywordsMatch(rule.keywords, text, rule.match)) return rule;
  }
  return null;
}

module.exports = { normalize, keywordsMatch, isActive, findRule };
