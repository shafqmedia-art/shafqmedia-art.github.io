/* شفق بوت — سكربت الواجهة (بدون مكتبات) */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // h('div', {class:'x', onclick}, ...children)
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v;
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(kid));
    return el;
  }

  const parse = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };

  async function upload(file) {
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) throw new Error(j.error || 'فشل الرفع');
    return j.url;
  }

  function pickFile(accept, cb) {
    const inp = h('input', { type: 'file', accept });
    inp.onchange = async () => {
      if (!inp.files[0]) return;
      try { cb(await upload(inp.files[0])); } catch (e) { alert(e.message); }
    };
    inp.click();
  }

  // ---------- القائمة الجانبية ----------
  const drawer = $('[data-drawer]');
  const scrim = $('[data-scrim]');
  const toggleDrawer = (open) => document.body.classList.toggle('nav-open', open);
  $('[data-menu]')?.addEventListener('click', () => toggleDrawer(!document.body.classList.contains('nav-open')));
  scrim?.addEventListener('click', () => toggleDrawer(false));
  $$('.grp > a', drawer || document).forEach((a) => a.addEventListener('click', (e) => {
    const g = a.parentElement;
    if (!g.classList.contains('open')) { e.preventDefault(); g.classList.add('open'); }
  }));

  // تبديل الحساب
  $('[data-switch]')?.addEventListener('change', (e) => {
    const id = e.target.value;
    if (!id) return;
    const parts = location.pathname.startsWith('/a/') ? location.pathname.split('/').slice(3).filter(Boolean) : [];
    const keep = parts[0] === 'store' ? parts.slice(0, 2) : parts.slice(0, 1);
    const rest = keep.length && !/^[a-f0-9]{12}$/.test(keep[keep.length - 1]) ? `/${keep.join('/')}` : '';
    location.href = `/a/${id}${rest}`;
  });

  // ---------- تأكيد قبل الحذف ----------
  document.addEventListener('submit', (e) => {
    const f = e.target;
    const btn = e.submitter;
    const msg = btn?.dataset.confirm || f.dataset.confirm;
    if (msg && !confirm(msg)) e.preventDefault();
  }, true);

  // ---------- إظهار حقول حسب الاختيار ----------
  function evalShow() {
    $$('[data-show-when]').forEach((el) => {
      const rule = el.dataset.showWhen;
      const neg = rule.includes('!=');
      const [name, val] = rule.split(neg ? '!=' : '=');
      const scope = el.closest('form') || document;
      const inp = $$(`[name="${name}"]`, scope);
      let cur = '';
      for (const i of inp) {
        if (i.type === 'radio' || i.type === 'checkbox') { if (i.checked) cur = i.value; } else cur = i.value;
      }
      const ok = neg ? cur !== val : cur === val;
      el.hidden = !ok;
    });
  }
  document.addEventListener('change', evalShow);
  evalShow();

  $$('[data-toggle-next]').forEach((c) => {
    const next = c.closest('label').nextElementSibling;
    const sync = () => { if (next) next.hidden = !c.checked; };
    c.addEventListener('change', sync); sync();
  });

  $$('form[data-readonly]').forEach((f) => $$('input,select,textarea,button', f).forEach((i) => { i.disabled = true; }));

  $$('[data-autosubmit]').forEach((i) => i.addEventListener('change', () => i.form.submit()));

  $$('textarea[data-count]').forEach((t) => {
    const c = h('div', { class: 'muted small counter' });
    t.after(c);
    const up = () => { c.textContent = `(${t.value.length} / ${t.maxLength})`; };
    t.addEventListener('input', up); up();
  });

  // ---------- منتقي صورة ----------
  $$('[data-img-pick]').forEach((box) => {
    const inp = $('input[type=hidden]', box);
    const prev = $('.img-prev', box);
    const any = 'acceptAny' in box.dataset;
    const show = () => {
      prev.replaceChildren();
      if (!inp.value) prev.append(h('span', {}, '＋'));
      else if (/\.mp4$/i.test(inp.value)) prev.append(h('video', { src: inp.value, muted: true, playsinline: true }));
      else prev.append(h('img', { src: inp.value, alt: '' }));
    };
    show();
    const go = () => pickFile(any ? 'image/*,video/mp4' : 'image/*', (url) => { inp.value = url; show(); });
    $('[data-upload]', box).onclick = go;
    prev.onclick = go;
    $('[data-clear]', box).onclick = () => { inp.value = ''; show(); };
  });

  // ---------- الكلمات المفتاحية (شيبس) ----------
  $$('[data-chips]').forEach((box) => {
    let words = parse(box.dataset.value, []);
    const hidden = h('input', { type: 'hidden', name: box.dataset.name });
    const input = h('input', { class: 'chip-in', placeholder: 'اكتب كلمة واضغط Enter' });
    const render = () => {
      hidden.value = JSON.stringify(words);
      $$('.chip', box).forEach((c) => c.remove());
      words.forEach((w, i) => input.before(h('span', { class: 'chip blue' }, w, h('button', { type: 'button', 'aria-label': 'حذف', onclick: () => { words.splice(i, 1); render(); } }, '×'))));
    };
    const addWord = () => {
      input.value.split(/[,،]/).map((x) => x.trim()).filter(Boolean).forEach((w) => { if (!words.includes(w)) words.push(w); });
      input.value = ''; render();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',' || e.key === '،') { e.preventDefault(); addWord(); }
      if (e.key === 'Backspace' && !input.value && words.length) { words.pop(); render(); }
    });
    input.addEventListener('blur', addWord);
    box.append(input, hidden);
    box.addEventListener('click', () => input.focus());
    box.closest('form')?.addEventListener('submit', addWord);
    render();
  });

  // ---------- اقترح صيغ ----------
  const PRESETS = [
    'تكرم {name}، التفاصيل صارت عندك بالخاص', 'أهلين {name}، شيّك رسائلك',
    'بعتنالك كل شي بالخاص', 'ردينا عليك برسالة {name}',
    'المعلومات عندك هلق بالرسائل', 'يسلمو {name}، شوف الخاص',
    'من عيوننا، بعتنالك التفاصيل', 'شيّك الإنبوكس {name}',
    'وصلك ردنا عالخاص', 'الأسعار والتفاصيل بالرسائل {name}', 'منوّر {name}، كل شي عندك بالخاص',
    'تفضّل، التفاصيل بالرسائل',
  ];
  $$('[data-gen-replies]').forEach((b) => b.addEventListener('click', () => {
    const t = $(`[name="${b.dataset.genReplies}"]`, b.closest('form'));
    const pick = [...PRESETS].sort(() => Math.random() - 0.5).slice(0, 6);
    t.value = pick.join('\n');
  }));

  // ---------- منتقي المنشور ----------
  $$('[data-post-picker]').forEach((box) => {
    const modal = $('[data-posts-modal]');
    const list = $('[data-posts-list]', modal);
    const sched = $('[data-scheduled]', modal);
    const load = async () => {
      list.innerHTML = '<p class="muted">جاري التحميل...</p>';
      try {
        const r = await fetch(`/a/${box.dataset.acc}/posts.json${sched.checked ? '?scheduled=1' : ''}`, { credentials: 'same-origin' });
        const j = await r.json();
        list.innerHTML = '';
        if (j.error) list.append(h('p', { class: 'bad-text small' }, j.error));
        if (!j.posts?.length) list.append(h('p', { class: 'muted' }, 'ما في منشورات.'));
        j.posts.forEach((p) => list.append(h('div', { class: 'post-item' },
          p.image ? h('img', { src: p.image, alt: '' }) : null,
          h('div', {}, h('div', { class: 'muted small' }, `${p.time ? new Date(p.time).toLocaleString('ar-SY') : ''}`), h('div', {}, (p.text || '—').slice(0, 160))),
          h('button', { type: 'button', class: 'btn sm', onclick: () => {
            $('[name=postId]', box).value = p.id; $('[name=postText]', box).value = (p.text || '').slice(0, 300); $('[name=postLink]', box).value = p.link || '';
            $('.post-prev', box).textContent = (p.text || p.id).slice(0, 120);
            modal.hidden = true;
          } }, 'اختار'))));
      } catch (e) { list.replaceChildren(h('p', { class: 'bad-text' }, e.message)); }
    };
    $('[data-open-posts]', box).onclick = () => { modal.hidden = false; load(); };
    sched.onchange = load;
    $('[data-close-modal]', modal).onclick = () => { modal.hidden = true; };
  });

  // ---------- خيارات المنتج للمنتج ----------
  $$('[data-variants]').forEach((box) => {
    let rows = parse(box.dataset.value, []);
    const hidden = h('input', { type: 'hidden', name: 'variants' });
    const render = () => {
      box.innerHTML = '';
      hidden.value = JSON.stringify(rows);
      rows.forEach((v, i) => box.append(h('div', { class: 'row variant' },
        h('input', { value: v.name || '', placeholder: 'الخيار (مثلاً: أسود / L)', oninput: (e) => { v.name = e.target.value; hidden.value = JSON.stringify(rows); } }),
        h('input', { type: 'number', min: 0, step: 'any', value: v.price || '', placeholder: 'السعر', oninput: (e) => { v.price = e.target.value; hidden.value = JSON.stringify(rows); } }),
        h('button', { type: 'button', class: 'op', onclick: () => { rows.splice(i, 1); render(); } }, SVG(ICONS.trash)))));
      box.append(h('button', { type: 'button', class: 'btn ghost sm', onclick: () => { rows.push({ name: '', price: '' }); render(); } }, '+ خيار'), hidden);
    };
    render();
  });

  // ---------- معرض صور المنتج ----------
  $$('[data-gallery]').forEach((box) => {
    let imgs = parse(box.dataset.value, []);
    const hidden = h('input', { type: 'hidden', name: box.dataset.name });
    const render = () => {
      box.innerHTML = '';
      hidden.value = JSON.stringify(imgs);
      imgs.forEach((u, i) => box.append(h('div', { class: 'g-thumb' }, h('img', { src: u, alt: '' }), h('button', { type: 'button', onclick: () => { imgs.splice(i, 1); render(); } }, '×'))));
      if (imgs.length < 9) box.append(h('button', { type: 'button', class: 'g-add', onclick: () => pickFile('image/*', (url) => { imgs.push(url); render(); }) }, '＋'));
      box.append(hidden);
    };
    render();
  });

  // ---------- ترتيب الصفوف بالسحب ----------
  $$('table[data-sortable]').forEach((table) => {
    const tbody = $('tbody', table);
    let drag = null;
    $$('tr', tbody).forEach((tr) => {
      tr.draggable = true;
      tr.addEventListener('dragstart', () => { drag = tr; tr.classList.add('dragging'); });
      tr.addEventListener('dragend', async () => {
        tr.classList.remove('dragging');
        const ids = $$('tr', tbody).map((r) => $('.ops', r)?.dataset.id).filter(Boolean);
        await fetch(table.dataset.sortable, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }), credentials: 'same-origin' });
      });
      tr.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!drag || drag === tr) return;
        const r = tr.getBoundingClientRect();
        tbody.insertBefore(drag, e.clientY > r.top + r.height / 2 ? tr.nextSibling : tr);
      });
    });
  });

  // ---------- أزرار القائمة الثابتة ----------
  $$('[data-menu-type]').forEach((sel) => {
    const row = sel.closest('form');
    const sync = () => $$('[data-for]', row).forEach((el) => { el.hidden = el.dataset.for !== sel.value; });
    sel.addEventListener('change', sync); sync();
  });

  // =================================================================
  //  منشئ الرسائل: نص · صورة · معرض · فيديو · ملف + أزرار
  // =================================================================
  const TYPE_LABEL = { text: 'نص', image: 'صورة', gallery: 'معرض', video: 'فيديو', file: 'ملف' };
  const SVG = (d) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ic'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.innerHTML = d; return s; };
  const ICONS = {
    text: '<path d="M5 6h14M5 12h14M5 18h9"/>', image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5L5 20"/>',
    gallery: '<rect x="2" y="6" width="14" height="13" rx="2"/><path d="M6 3h14a2 2 0 0 1 2 2v11"/>', video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
    file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5"/>', trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  };
  const TYPE_ICON = new Proxy({}, { get: (_, k) => (ICONS[k] ? SVG(ICONS[k]) : '') });
  const BTN_TABS = [['block', 'خطوة'], ['url', 'رابط'], ['call', 'اتصال'], ['whatsapp', 'واتساب'], ['store', 'المتجر']];

  function initBuilder(box) {
    const state = parse(box.dataset.value, { items: [] });
    state.items ||= [];
    const blocks = parse(box.dataset.blocks, []);
    const textOnly = 'textOnly' in box.dataset;
    const hidden = h('input', { type: 'hidden', name: box.dataset.name });
    const sync = () => { hidden.value = JSON.stringify({ items: state.items }); };

    const btnSummary = (b) => {
      if (b.type === 'block') return blocks.find((x) => x.id === b.target)?.name || 'اختار وحدة';
      if (b.type === 'store') return 'المتجر';
      return b.target || '—';
    };

    function buttonEditor(list, idx, onDone) {
      const b = idx == null ? { title: '', type: 'block', target: '', message: '' } : { ...list[idx] };
      const panel = h('div', { class: 'btn-editor' });
      const draw = () => {
        panel.innerHTML = '';
        const title = h('input', { value: b.title, maxlength: 20, placeholder: 'عنوان الزر (متل: واتساب)', oninput: (e) => { b.title = e.target.value; cnt.textContent = `(${b.title.length} / 20)`; } });
        const cnt = h('span', { class: 'muted small' }, `(${b.title.length} / 20)`);
        const tabs = h('div', { class: 'tabs mini' }, BTN_TABS.map(([k, l]) => h('a', { href: '#', class: b.type === k ? 'on' : '', onclick: (e) => { e.preventDefault(); b.type = k; if (k !== 'block') b.target = b.type === 'store' ? '' : b.target; draw(); } }, l)));
        let fields;
        if (b.type === 'block') {
          fields = h('div', {}, h('label', {}, 'يذهب إلى:'), h('select', { onchange: (e) => { b.target = e.target.value; } },
            h('option', { value: '' }, 'اختار خطوة'), blocks.map((x) => h('option', { value: x.id, selected: x.id === b.target }, x.name))),
          blocks.length ? null : h('p', { class: 'muted small' }, 'لسا ما في خطوات. اعملها من "مسارات المحادثة".'));
        } else if (b.type === 'url') {
          fields = h('div', {}, h('label', {}, 'يفتح الرابط:'), h('input', { dir: 'ltr', value: b.target, placeholder: 'https://', oninput: (e) => { b.target = e.target.value; } }));
        } else if (b.type === 'call') {
          fields = h('div', {}, h('label', {}, 'اتصل بالرقم:'), h('input', { dir: 'ltr', inputmode: 'tel', value: b.target, placeholder: '00963988013623', oninput: (e) => { b.target = e.target.value; } }), h('p', { class: 'muted small' }, 'دخّل الرقم بادئاً برمز البلد (مثلاً سوريا 00963)، وبأرقام إنكليزية.'));
        } else if (b.type === 'whatsapp') {
          fields = h('div', {}, h('label', {}, 'رقم الواتساب:'), h('input', { dir: 'ltr', inputmode: 'tel', value: b.target, placeholder: '00963988013623', oninput: (e) => { b.target = e.target.value; } }),
            h('label', {}, 'رسالة إضافية:'), h('textarea', { rows: 2, placeholder: 'الرسالة اللي رح تنكتب بشكل افتراضي (اختياري)', oninput: (e) => { b.message = e.target.value; } }, b.message || ''));
        } else {
          fields = h('p', { class: 'muted small' }, 'الزر بيفتح متجر شفق جوّا المحادثة.');
        }
        panel.append(h('div', { class: 'row between' }, title, cnt), tabs, fields, h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn sm', onclick: () => {
            if (!b.title.trim()) return alert('اكتب عنوان للزر');
            if (b.type !== 'store' && !String(b.target).trim()) return alert('حدد وجهة الزر');
            if (idx == null) list.push(b); else list[idx] = b;
            onDone();
          } }, 'حفظ'),
          h('button', { type: 'button', class: 'btn danger-btn sm', onclick: onDone }, 'إلغاء'),
          idx != null ? h('button', { type: 'button', class: 'op', title: 'حذف الزر', onclick: () => { list.splice(idx, 1); onDone(); } }, SVG(ICONS.trash)) : null));
      };
      draw();
      return panel;
    }

    function buttonsArea(list, max = 3) {
      const wrap = h('div', { class: 'btns' });
      const draw = () => {
        wrap.innerHTML = '';
        list.forEach((b, i) => wrap.append(h('button', { type: 'button', class: 'pill-btn', onclick: () => { wrap.innerHTML = ''; wrap.append(buttonEditor(list, i, () => { draw(); sync(); })); } },
          h('b', {}, b.title), h('small', {}, btnSummary(b)))));
        if (list.length < max) {
          wrap.append(h('button', { type: 'button', class: 'add-btn', onclick: () => { wrap.innerHTML = ''; wrap.append(buttonEditor(list, null, () => { draw(); sync(); })); } }, '+ زر جديد'));
        }
      };
      draw();
      return wrap;
    }

    function mediaItem(it, accept) {
      const prev = h('div', { class: 'media-prev' });
      const showPrev = () => {
        prev.innerHTML = '';
        if (!it.url) return prev.append(h('span', { class: 'muted' }, 'ما في ملف لسا'));
        if (it.type === 'image') prev.append(h('img', { src: it.url, alt: '' }));
        else if (it.type === 'video') prev.append(h('video', { src: it.url, controls: true, preload: 'metadata' }));
        else prev.append(h('a', { href: it.url, target: '_blank' }, '', it.url.split('/').pop()));
      };
      showPrev();
      const url = h('input', { dir: 'ltr', value: it.url || '', placeholder: 'أو حط رابط https://', oninput: (e) => { it.url = e.target.value.trim(); showPrev(); sync(); } });
      return h('div', {}, prev, h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn ghost sm', onclick: () => pickFile(accept, (u) => { it.url = u; url.value = u; showPrev(); sync(); }) }, 'استبدال / رفع'), url));
    }

    function galleryItem(it) {
      it.cards ||= [];
      it.ratio ||= 'horizontal';
      const wrap = h('div');
      const draw = () => {
        wrap.innerHTML = '';
        const seg = h('div', { class: 'row' },
          ['horizontal', 'square'].map((r) => h('button', { type: 'button', class: `btn sm ${it.ratio === r ? 'dark' : 'ghost'}`, onclick: () => { it.ratio = r; draw(); sync(); } }, r === 'horizontal' ? '▭ مستطيل' : '□ مربع')));
        const strip = h('div', { class: `cards-strip ${it.ratio}` });
        it.cards.forEach((c, i) => {
          c.buttons ||= [];
          const img = h('div', { class: 'card-img', onclick: () => pickFile('image/*', (u) => { c.image = u; draw(); sync(); }) },
            c.image ? h('img', { src: c.image, alt: '' }) : h('span', {}, '＋ صورة'));
          strip.append(h('div', { class: 'g-card' }, img,
            h('input', { value: c.title || '', maxlength: 80, placeholder: 'العنوان', oninput: (e) => { c.title = e.target.value; sync(); } }),
            h('textarea', { rows: 2, maxlength: 80, placeholder: 'الوصف / السعر', oninput: (e) => { c.subtitle = e.target.value; sync(); } }, c.subtitle || ''),
            h('input', { dir: 'ltr', value: c.url || '', placeholder: 'رابط (اختياري)', oninput: (e) => { c.url = e.target.value; sync(); } }),
            buttonsArea(c.buttons),
            h('div', { class: 'row card-ops' },
              h('button', { type: 'button', class: 'op', title: 'حذف', onclick: () => { it.cards.splice(i, 1); draw(); sync(); } }, SVG(ICONS.trash)),
              h('button', { type: 'button', class: 'op', title: 'نسخ', onclick: () => { it.cards.splice(i + 1, 0, structuredClone(c)); draw(); sync(); } }, '⧉'),
              i > 0 ? h('button', { type: 'button', class: 'op', title: 'تحريك', onclick: () => { [it.cards[i - 1], it.cards[i]] = [it.cards[i], it.cards[i - 1]]; draw(); sync(); } }, '⇄') : null)));
        });
        if (it.cards.length < 10) strip.append(h('button', { type: 'button', class: 'g-card add', onclick: () => { it.cards.push({ title: '', subtitle: '', image: '', url: '', buttons: [] }); draw(); sync(); } }, '＋ كرت جديد'));
        wrap.append(seg, strip, h('p', { class: 'muted small' }, 'لحد 10 كروت، وكل كرت فيه لحد 3 أزرار. اختار مربع أو مستطيل لتطلع الصور كلها بنفس القياس.'));
      };
      draw();
      return wrap;
    }

    function render() {
      box.innerHTML = '';
      const list = h('div', { class: 'mb-items' });
      state.items.forEach((it, i) => {
        const head = h('div', { class: 'mb-head' }, h('span', { class: 'mb-type' }, TYPE_LABEL[it.type] || it.type), h('div', { class: 'row' },
          i > 0 ? h('button', { type: 'button', class: 'op', title: 'لفوق', onclick: () => { [state.items[i - 1], state.items[i]] = [state.items[i], state.items[i - 1]]; render(); } }, '↑') : null,
          i < state.items.length - 1 ? h('button', { type: 'button', class: 'op', title: 'لتحت', onclick: () => { [state.items[i + 1], state.items[i]] = [state.items[i], state.items[i + 1]]; render(); } }, '↓') : null,
          h('button', { type: 'button', class: 'op', title: 'نسخ', onclick: () => { state.items.splice(i + 1, 0, structuredClone(it)); render(); } }, '⧉'),
          h('button', { type: 'button', class: 'op', title: 'حذف', onclick: () => { state.items.splice(i, 1); render(); } }, SVG(ICONS.trash))));
        let body;
        if (it.type === 'text') {
          it.buttons ||= [];
          const ta = h('textarea', { rows: 4, maxlength: 2000, placeholder: 'اكتب نص الرسالة... (بيدعم {name})', oninput: (e) => { it.text = e.target.value; cnt.textContent = `${it.text.length} / 2000`; sync(); } }, it.text || '');
          const cnt = h('span', { class: 'muted small counter', dir: 'ltr' }, `${(it.text || '').length} / 2000`);
          body = h('div', {}, ta, cnt, textOnly ? null : buttonsArea(it.buttons));
        } else if (it.type === 'gallery') body = galleryItem(it);
        else body = mediaItem(it, { image: 'image/*', video: 'video/mp4', file: '.pdf,application/pdf' }[it.type]);
        list.append(h('div', { class: 'mb-item' }, head, body));
      });
      const tools = h('div', { class: `mb-tools ${textOnly ? 'one' : ''}` }, (textOnly ? ['text'] : ['text', 'image', 'gallery', 'video', 'file']).map((t) => h('button', { type: 'button', onclick: () => {
        const it = t === 'text' ? { type: 'text', text: '', buttons: [] } : t === 'gallery' ? { type: 'gallery', ratio: 'horizontal', cards: [{ title: '', subtitle: '', image: '', url: '', buttons: [] }] } : { type: t, url: '' };
        state.items.push(it); render();
        if (t === 'image' || t === 'video' || t === 'file') pickFile({ image: 'image/*', video: 'video/mp4', file: '.pdf,application/pdf' }[t], (u) => { it.url = u; render(); });
      } }, h('span', {}, TYPE_ICON[t]), TYPE_LABEL[t])));
      if (!state.items.length) list.append(h('p', { class: 'muted small center' }, 'ابني رسالتك من الأزرار تحت: نص، صورة، معرض كروت، فيديو أو ملف.'));
      box.append(list, tools, hidden);
      sync();
    }
    render();
  }
  $$('[data-builder]').forEach(initBuilder);

  // ---------- نسخ النص ----------
  $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const src = $('[data-copy-src]', b.closest('.card'));
    try { await navigator.clipboard.writeText(src.textContent); b.textContent = 'انتسخ'; } catch { /* المتصفح ما سمح */ }
  }));

  // ---------- توليد ردود بالذكاء (بفورم الرد التلقائي) ----------
  $$('[data-ai-replies]').forEach((b) => b.addEventListener('click', async () => {
    const form = b.closest('form');
    const t = $(`[name="${b.dataset.aiReplies}"]`, form);
    const old = b.textContent;
    b.disabled = true; b.textContent = 'عم يكتب...';
    try {
      const fd = new URLSearchParams({ context: [$('[name=title]', form)?.value, $('[name=postText]', form)?.value].filter(Boolean).join(' — ') });
      const r = await fetch(`/a/${b.dataset.acc}/ai/replies.json`, { method: 'POST', body: fd, credentials: 'same-origin' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'ما زبط');
      t.value = j.replies.join('\n');
    } catch (e) { alert(e.message); }
    b.disabled = false; b.textContent = old;
  }));

  // ---------- حاسبة سعر الاشتراك ----------
  $$('[data-subscribe]').forEach((form) => {
    const plans = parse(form.dataset.plans, []);
    const cur = form.dataset.currency || '';
    const out = $('[data-price]', form);
    const msg = $('[data-coupon-msg]', form);
    const bonus = $('[data-bonus-msg]', form);
    let pct = 0; let fixed = 0;
    const val = (n) => $(`[name=${n}]:checked`, form)?.value;
    const calc = () => {
      const p = plans.find((x) => x.id === val('planId'));
      const v = Number(p?.prices?.[val('platforms')]?.[val('period')]) || 0;
      if (!v) { out.textContent = 'بيحدده فريق شفق'; }
      else {
        const d = pct ? Math.round((v * pct) / 100) : Math.min(v, fixed);
        out.textContent = `${(v - d).toLocaleString('en-US')} ${cur}${d ? ` (بدل ${v.toLocaleString('en-US')})` : ''}`;
      }
      if (bonus) bonus.hidden = !(form.dataset.bonus === '1' && ['m3', 'm6', 'm12'].includes(val('period')) && val('planId') !== 'lite');
    };
    form.addEventListener('change', calc);
    $('[data-check-coupon]', form)?.addEventListener('click', async () => {
      const code = $('[name=coupon]', form).value.trim();
      if (!code) return;
      const q = new URLSearchParams({ code, plan: val('planId'), period: val('period'), platforms: val('platforms') });
      const j = await (await fetch(`/billing/coupon.json?${q}`, { credentials: 'same-origin' })).json();
      msg.textContent = j.ok ? `${j.msg}` : `${j.msg}`;
      pct = j.ok ? j.percent : 0; fixed = j.ok && !j.percent ? j.discount : 0;
      calc();
    });
    calc();
  });

  // =================================================================
  //  التطبيق: Service Worker + زر التثبيت
  // =================================================================
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) {
    document.documentElement.classList.add('standalone');
    $$('[data-installed]').forEach((el) => { el.hidden = false; });
  }
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    $$('[data-install-btn]').forEach((b) => { b.hidden = false; });
  });
  $$('[data-install-btn]').forEach((b) => b.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    b.hidden = true;
  }));
})();
