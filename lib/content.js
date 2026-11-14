// إدارة المحتوى: نشر مباشر ومجدول على فيسبوك وإنستغرام
const db = require('./db');
const meta = require('./meta');
const M = require('./messages');

const STATUS = { draft: 'مسودة', scheduled: 'مجدول', publishing: 'عم ينتشر...', published: 'انتشر', failed: 'فشل' };

async function publish(post) {
  const acc = db.getAccount(post.accountId);
  if (!acc) return db.update('posts', post.id, { status: 'failed', error: 'الحساب انحذف' });
  db.update('posts', post.id, { status: 'publishing' });
  try {
    const media = post.media ? M.absUrl(post.media) : '';
    let r;
    const future = post.publishAt && new Date(post.publishAt).getTime() > Date.now() + 11 * 60e3;
    if (acc.platform === 'facebook') {
      // فيسبوك بيجدول لحاله (لازم 10 دقايق لقدّام على الأقل)
      r = await meta.publishFacebook(acc, { text: post.text, media, mediaType: post.mediaType, publishAt: future ? post.publishAt : null });
      db.update('posts', post.id, { status: future ? 'scheduled' : 'published', externalId: r.id, fbScheduled: future, publishedAt: future ? null : Date.now(), error: '' });
    } else {
      r = await meta.publishInstagram(acc, { text: post.text, media, mediaType: post.mediaType });
      db.update('posts', post.id, { status: 'published', externalId: r.id, publishedAt: Date.now(), error: '' });
    }
    db.log({ accountId: acc.id, kind: 'post', text: `منشور: ${String(post.text || '').slice(0, 80)}`, result: 'replied' });
  } catch (err) {
    db.update('posts', post.id, { status: 'failed', error: err.message });
    db.log({ accountId: acc.id, kind: 'post', text: String(post.text || '').slice(0, 80), result: 'error', error: err.message });
  }
}

// منشورات إنستغرام المجدولة بتنشر من هون، ومنشورات فيسبوك المجدولة بتصير "انتشر" بعد وقتها
function tick() {
  const now = Date.now();
  for (const p of db.where('posts', (x) => x.status === 'scheduled')) {
    const due = new Date(p.publishAt).getTime() <= now;
    if (!due) continue;
    if (p.fbScheduled) db.update('posts', p.id, { status: 'published', publishedAt: new Date(p.publishAt).getTime() });
    else publish(p).catch((e) => console.error('publish', e));
  }
}

function startScheduler() {
  setInterval(tick, 30e3).unref();
}

module.exports = { STATUS, publish, tick, startScheduler };
