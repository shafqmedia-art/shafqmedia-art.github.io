// حماية: فتح الموقع دائماً عبر HTTPS، ومنع عرضه داخل إطار موقع تاني (clickjacking)
(function () {
  if (location.protocol === 'http:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') { location.replace('https://' + location.host + location.pathname + location.search + location.hash); return; }
  if (window.top !== window.self) { try { window.top.location = window.self.location.href; } catch (e) { document.documentElement.style.display = 'none'; } }
})();
(function () {
  var el = document.getElementById('intro');
  var seen = false; try { seen = sessionStorage.getItem('shafq_intro') === '1'; sessionStorage.setItem('shafq_intro', '1'); } catch (e) {}
  if (seen) { el.remove(); return; }
  document.documentElement.classList.add('intro-on');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var steps = ['\u0634\u200D', '\u0634\u0641\u200D', '\u0634\u0641\u0642'], t = document.getElementById('i-text'), ac = null, played = false;
  function chime() {
    if (played) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      if (ac.state !== 'running') return;
      played = true;
      var now = ac.currentTime + 0.05, master = ac.createGain(), lp = ac.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 3200; master.gain.value = 0.16; lp.connect(master); master.connect(ac.destination);
      [[659.25, 0], [987.77, 0.35], [1318.5, 0.7]].forEach(function (n) {
        [1, 2.01].forEach(function (mult, i) {
          var o = ac.createOscillator(), g = ac.createGain(), st = now + n[1];
          o.type = 'sine'; o.frequency.value = n[0] * mult;
          g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(i ? 0.12 : 0.5, st + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, st + (i ? 0.6 : 1.8));
          o.connect(g); g.connect(lp); o.start(st); o.stop(st + 2);
        });
      });
    } catch (e) {}
  }
  chime();
  var timers = [];
  function step(i) { t.textContent = steps[i]; t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop'); }
  if (reduce) step(2);
  else [450, 800, 1150].forEach(function (ms, i) { timers.push(setTimeout(function () { step(i); }, ms)); });
  function done() {
    timers.forEach(clearTimeout); step(2);
    el.classList.add('out'); document.documentElement.classList.remove('intro-on');
    setTimeout(function () { if (el.parentNode) el.remove(); }, 600);
  }
  timers.push(setTimeout(done, reduce ? 900 : 2400));
  el.addEventListener('pointerdown', function () { chime(); if (played) { timers.forEach(clearTimeout); timers = [setTimeout(done, 1600)]; [0, 350, 700].forEach(function (ms, i) { timers.push(setTimeout(function () { step(i); }, ms)); }); } else done(); }, { once: true });
})();
