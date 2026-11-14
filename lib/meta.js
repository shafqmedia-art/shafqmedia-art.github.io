// كل التعامل مع Meta (فيسبوك + إنستغرام)
const crypto = require('node:crypto');

const V = 'v21.0';
const GRAPH = `https://graph.facebook.com/${V}`;

const APP_ID = () => process.env.META_APP_ID;
const APP_SECRET = () => process.env.META_APP_SECRET;
const REDIRECT = () => `${process.env.BASE_URL}/oauth/callback`;

// الصلاحيات المطلوبة لصفحات فيسبوك + حسابات إنستغرام المربوطة فيها
const SCOPES = [
  'pages_show_list',
  'pages_messaging',
  'pages_manage_metadata',
  'pages_read_engagement',
  'pages_manage_engagement',
  'pages_manage_posts',
  'pages_read_user_content',
  'business_management',
  'instagram_basic',
  'instagram_manage_messages',
  'instagram_manage_comments',
  'instagram_content_publish',
].join(',');

async function graph(method, pathname, { token, params = {}, body } = {}) {
  const url = new URL(pathname.startsWith('http') ? pathname : GRAPH + pathname);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
  if (token) url.searchParams.set('access_token', token);
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const err = new Error(data.error?.message || `HTTP ${res.status}`);
    err.meta = data.error;
    throw err;
  }
  return data;
}

// ---------- الربط (OAuth) ----------
function loginUrl(state) {
  const u = new URL(`https://www.facebook.com/${V}/dialog/oauth`);
  u.searchParams.set('client_id', APP_ID());
  u.searchParams.set('redirect_uri', REDIRECT());
  u.searchParams.set('scope', SCOPES);
  u.searchParams.set('state', state);
  u.searchParams.set('response_type', 'code');
  return u.toString();
}

async function exchangeCode(code) {
  const short = await graph('GET', '/oauth/access_token', {
    params: { client_id: APP_ID(), client_secret: APP_SECRET(), redirect_uri: REDIRECT(), code },
  });
  // توكن طويل الأمد ← توكنات الصفحات اللي منه ما بتنتهي
  const long = await graph('GET', '/oauth/access_token', {
    params: {
      grant_type: 'fb_exchange_token', client_id: APP_ID(), client_secret: APP_SECRET(),
      fb_exchange_token: short.access_token,
    },
  });
  return long.access_token;
}

// كل الصفحات اللي عندك صلاحية عليها + حساب الإنستغرام المربوط بكل صفحة
async function listPages(userToken) {
  const pages = [];
  let next = '/me/accounts';
  let params = { fields: 'id,name,access_token,instagram_business_account{id,username,name}', limit: '100' };
  while (next) {
    const data = await graph('GET', next, { token: userToken, params });
    pages.push(...(data.data || []));
    next = data.paging?.next || null;
    params = {};
  }
  return pages;
}

async function subscribePage(pageId, pageToken) {
  return graph('POST', `/${pageId}/subscribed_apps`, {
    token: pageToken,
    params: { subscribed_fields: 'messages,messaging_postbacks,messaging_referrals,feed' },
  });
}

async function unsubscribePage(pageId, pageToken) {
  return graph('DELETE', `/${pageId}/subscribed_apps`, { token: pageToken });
}

// ---------- الإرسال ----------
// message: كائن رسالة جاهز (text / attachment) — opts: { tag, notification }
async function send(acc, recipient, message, opts = {}) {
  const body = { recipient, message };
  if (opts.tag) {
    body.messaging_type = 'MESSAGE_TAG';
    body.tag = opts.tag;
  } else if (!recipient.comment_id) {
    body.messaging_type = opts.update ? 'UPDATE' : 'RESPONSE';
  }
  if (opts.notification && acc.platform === 'facebook') body.notification_type = opts.notification;
  return graph('POST', `/${acc.pageId}/messages`, { token: acc.token, body });
}

const sendText = (acc, psid, text, opts) => send(acc, { id: psid }, { text }, opts);

// رد علني تحت التعليق
async function publicReply(acc, commentId, text) {
  const path = acc.platform === 'instagram' ? `/${commentId}/replies` : `/${commentId}/comments`;
  return graph('POST', path, { token: acc.token, params: { message: text } });
}

// إعجاب تلقائي بالتعليق (فيسبوك بس — إنستغرام ما بيسمح)
async function likeComment(acc, commentId) {
  if (acc.platform !== 'facebook') return null;
  return graph('POST', `/${commentId}/likes`, { token: acc.token });
}

// هل الشخص عامل إعجاب بالمنشور؟ (فيسبوك بس، بيفحص أول 1000 تفاعل)
async function userReactedToPost(acc, postId, userId) {
  if (acc.platform !== 'facebook') return true;
  let next = `/${postId}/reactions`;
  let params = { limit: '500', fields: 'id' };
  for (let page = 0; page < 2 && next; page++) {
    const data = await graph('GET', next, { token: acc.token, params });
    if ((data.data || []).some((r) => String(r.id) === String(userId))) return true;
    next = data.paging?.next || null;
    params = {};
  }
  return false;
}

// اسم الشخص (بيفيد بالطلبيات والمشتركين)
async function profileName(acc, psid) {
  try {
    const fields = acc.platform === 'instagram' ? 'name,username' : 'first_name,last_name';
    const p = await graph('GET', `/${psid}`, { token: acc.token, params: { fields } });
    return p.name || p.username || [p.first_name, p.last_name].filter(Boolean).join(' ');
  } catch {
    return '';
  }
}

// ---------- المنشورات ----------
async function listPosts(acc) {
  if (acc.platform === 'instagram') {
    const d = await graph('GET', `/${acc.externalId}/media`, {
      token: acc.token, params: { fields: 'id,caption,timestamp,media_url,thumbnail_url,permalink', limit: '30' },
    });
    return (d.data || []).map((m) => ({
      id: m.id, text: m.caption || '', time: m.timestamp, image: m.thumbnail_url || m.media_url, link: m.permalink,
    }));
  }
  const d = await graph('GET', `/${acc.pageId}/posts`, {
    token: acc.token, params: { fields: 'id,message,created_time,full_picture,permalink_url', limit: '30' },
  });
  return (d.data || []).map((p) => ({
    id: p.id, text: p.message || '', time: p.created_time, image: p.full_picture, link: p.permalink_url,
  }));
}

async function listScheduledPosts(acc) {
  if (acc.platform !== 'facebook') return [];
  const d = await graph('GET', `/${acc.pageId}/scheduled_posts`, {
    token: acc.token, params: { fields: 'id,message,scheduled_publish_time,full_picture' },
  });
  return (d.data || []).map((p) => ({
    id: p.id, text: p.message || '', time: new Date(p.scheduled_publish_time * 1000).toISOString(), image: p.full_picture, scheduled: true,
  }));
}

// منشور جديد على صفحة فيسبوك (مع صورة اختيارية وجدولة اختيارية)
async function createPost(acc, { text, imageUrl, publishAt }) {
  if (acc.platform !== 'facebook') throw new Error('إنشاء منشور من المنصة متاح لصفحات فيسبوك بس');
  const params = {};
  if (publishAt) {
    params.published = 'false';
    params.scheduled_publish_time = String(Math.floor(new Date(publishAt).getTime() / 1000));
  }
  if (imageUrl) {
    const r = await graph('POST', `/${acc.pageId}/photos`, { token: acc.token, params: { ...params, url: imageUrl, caption: text } });
    return r.post_id || `${acc.pageId}_${r.id}`;
  }
  const r = await graph('POST', `/${acc.pageId}/feed`, { token: acc.token, params: { ...params, message: text } });
  return r.id;
}

// إخفاء أو حذف تعليق (فلترة الكلمات النابية)
async function moderateComment(acc, commentId, action = 'hide') {
  if (action === 'delete') return graph('DELETE', `/${commentId}`, { token: acc.token });
  const params = acc.platform === 'instagram' ? { hide: 'true' } : { is_hidden: 'true' };
  return graph('POST', `/${commentId}`, { token: acc.token, params });
}

// ---------- نشر المحتوى ----------
// فيسبوك: نص / صورة / فيديو، مع جدولة من فيسبوك نفسها
async function publishFacebook(acc, { text, media, mediaType, publishAt }) {
  const params = {};
  if (publishAt) { params.published = 'false'; params.scheduled_publish_time = String(Math.floor(new Date(publishAt).getTime() / 1000)); }
  if (media && mediaType === 'video') {
    const r = await graph('POST', `/${acc.pageId}/videos`, { token: acc.token, params: { ...params, file_url: media, description: text } });
    return { id: r.id };
  }
  if (media) {
    const r = await graph('POST', `/${acc.pageId}/photos`, { token: acc.token, params: { ...params, url: media, caption: text } });
    return { id: r.post_id || r.id };
  }
  const r = await graph('POST', `/${acc.pageId}/feed`, { token: acc.token, params: { ...params, message: text } });
  return { id: r.id };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// إنستغرام: صورة أو ريلز (بينشر هلق — الجدولة بيعملها سيرفر شفق بوت)
async function publishInstagram(acc, { text, media, mediaType }) {
  if (!media) throw new Error('إنستغرام بدّه صورة أو فيديو مع المنشور');
  const params = mediaType === 'video'
    ? { media_type: 'REELS', video_url: media, caption: text, share_to_feed: 'true' }
    : { image_url: media, caption: text };
  const c = await graph('POST', `/${acc.externalId}/media`, { token: acc.token, params });
  // الفيديو بياخد وقت ليجهز
  for (let i = 0; i < 40; i++) {
    const st = await graph('GET', `/${c.id}`, { token: acc.token, params: { fields: 'status_code' } });
    if (!st.status_code || st.status_code === 'FINISHED') break;
    if (st.status_code === 'ERROR') throw new Error('إنستغرام ما قدر يعالج الفيديو');
    await wait(mediaType === 'video' ? 6000 : 1500);
  }
  const r = await graph('POST', `/${acc.externalId}/media_publish`, { token: acc.token, params: { creation_id: c.id } });
  return { id: r.id };
}

// ---------- إعدادات الماسنجر (الترحيب، زر البداية، القائمة الثابتة) ----------
async function setMessengerProfile(acc, profile) {
  const params = acc.platform === 'instagram' ? { platform: 'instagram' } : {};
  return graph('POST', '/me/messenger_profile', { token: acc.token, params, body: profile });
}

// ---------- أمان الـ Webhook ----------
function verifySignature(rawBody, header) {
  if (!APP_SECRET()) return false;
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', APP_SECRET()).update(rawBody).digest('hex');
  const got = header.slice(7);
  if (got.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

module.exports = {
  graph, loginUrl, exchangeCode, listPages, subscribePage, unsubscribePage,
  send, sendText, publicReply, likeComment, userReactedToPost, profileName,
  listPosts, listScheduledPosts, createPost, setMessengerProfile, verifySignature,
  moderateComment, publishFacebook, publishInstagram,
};
