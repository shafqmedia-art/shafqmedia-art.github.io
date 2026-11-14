// تحويل "الرسالة" اللي منبنيها باللوحة (نص، صورة، معرض، فيديو، ملف + أزرار) لرسائل Meta
//
// spec = { items: [
//   { type: 'text', text, buttons: [Button] },
//   { type: 'image' | 'video' | 'file', url },
//   { type: 'gallery', ratio: 'horizontal'|'square', cards: [{ image, title, subtitle, url, buttons }] },
// ] }
// Button = { title, type: 'block'|'url'|'call'|'whatsapp'|'store', target, message }

const digits = (s) => String(s || '').replace(/[^\d]/g, '').replace(/^00/, '');

function absUrl(u) {
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return `${process.env.BASE_URL || ''}${u.startsWith('/') ? '' : '/'}${u}`;
}

const fill = (text, vars = {}) =>
  String(text || '').replace(/\{(name|الاسم)\}/g, () => vars.name || '');

function button(acc, b) {
  const title = String(b.title || '').slice(0, 20) || 'اكبس هون';
  switch (b.type) {
    case 'block':
      return { type: 'postback', title, payload: `BLOCK:${b.target}` };
    case 'store':
      return { type: 'postback', title, payload: 'STORE' };
    case 'url':
      return { type: 'web_url', title, url: absUrl(b.target) };
    case 'whatsapp': {
      const text = b.message ? `?text=${encodeURIComponent(b.message)}` : '';
      return { type: 'web_url', title, url: `https://wa.me/${digits(b.target)}${text}` };
    }
    case 'call':
      return acc.platform === 'facebook'
        ? { type: 'phone_number', title, payload: `+${digits(b.target)}` }
        : { type: 'postback', title, payload: `CALL:${digits(b.target)}` };
    case 'postback':
      return { type: 'postback', title, payload: b.target };
    default:
      return null;
  }
}

const buttons = (acc, list) => (list || []).map((b) => button(acc, b)).filter(Boolean).slice(0, 3);

function generic(acc, elements, ratio) {
  const payload = { template_type: 'generic', elements: elements.slice(0, 10) };
  if (acc.platform === 'facebook' && ratio === 'square') payload.image_aspect_ratio = 'square';
  return { attachment: { type: 'template', payload } };
}

function card(acc, c, vars) {
  const el = { title: fill(c.title, vars).slice(0, 80) || '—' };
  if (c.subtitle) el.subtitle = fill(c.subtitle, vars).slice(0, 80);
  if (c.image) el.image_url = absUrl(c.image);
  if (c.url) el.default_action = { type: 'web_url', url: absUrl(c.url) };
  const bs = buttons(acc, c.buttons);
  if (bs.length) el.buttons = bs;
  return el;
}

// بيرجّع مصفوفة رسائل جاهزة للإرسال بالترتيب
function toMessages(acc, spec, vars = {}) {
  const out = [];
  for (const it of spec?.items || []) {
    if (it.type === 'text') {
      const text = fill(it.text, vars).trim();
      const bs = buttons(acc, it.buttons);
      if (!text && !bs.length) continue;
      if (!bs.length) {
        out.push({ text: text.slice(0, 2000) });
      } else if (acc.platform === 'facebook') {
        out.push({ attachment: { type: 'template', payload: { template_type: 'button', text: (text || 'اختار:').slice(0, 640), buttons: bs } } });
      } else {
        // إنستغرام: الأزرار بتنبعت ككرت (العنوان لحد 80 حرف)
        if (text.length > 80) out.push({ text: text.slice(0, 1000) });
        out.push(generic(acc, [{ title: text.length > 80 ? 'اختار:' : text || 'اختار:', buttons: bs }]));
      }
    } else if (['image', 'video', 'file'].includes(it.type) && it.url) {
      out.push({ attachment: { type: it.type, payload: { url: absUrl(it.url), is_reusable: true } } });
    } else if (it.type === 'gallery' && it.cards?.length) {
      out.push(generic(acc, it.cards.map((c) => card(acc, c, vars)), it.ratio));
    }
  }
  return out;
}

const isEmpty = (spec) => !(spec?.items || []).length;

// باقة "نص فقط": منشيل الصور والأزرار
const textOnly = (spec) => ({ items: (spec?.items || []).filter((it) => it.type === 'text').map((it) => ({ type: 'text', text: it.text, buttons: [] })) });

// نص بسيط للعرض (بالسجل والتجربة)
function preview(spec) {
  return (spec?.items || []).map((it) => {
    if (it.type === 'text') return it.text + ((it.buttons || []).length ? `  [${it.buttons.map((b) => b.title).join(' | ')}]` : '');
    if (it.type === 'gallery') return `معرض (${(it.cards || []).length} كرت)`;
    return { image: 'صورة', video: 'فيديو', file: 'ملف' }[it.type] || it.type;
  }).join('\n');
}

module.exports = { toMessages, isEmpty, textOnly, preview, absUrl, digits, fill, card, generic, buttons };
