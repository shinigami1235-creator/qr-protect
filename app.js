/* QR Protect: camera and picture scanning, the result sheet and recent scans.
   Nothing here opens a link on its own. Every action waits for a tap. */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };
  const video = $('video');
  const viewfinder = $('viewfinder');
  const work = $('work');
  const ctx = work.getContext('2d', { willReadFrequently: true });

  let stream = null;
  let scanning = false;
  let detector = null;
  let lastRaw = '';
  let lastAt = 0;
  let sheetOpen = false;

  // ---------- decoding ----------

  async function getDetector() {
    if (detector !== null) return detector;
    detector = false;
    try {
      if ('BarcodeDetector' in window) {
        const formats = await window.BarcodeDetector.getSupportedFormats();
        if (formats.indexOf('qr_code') >= 0) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      }
    } catch (e) { detector = false; }
    return detector;
  }

  function jsqrFrom(source, sw, sh, maxSide) {
    const scale = Math.min(1, maxSide / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    work.width = w; work.height = h;
    ctx.drawImage(source, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const hit = window.jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
    return hit && hit.data ? hit.data : null;
  }

  // zxing reads several codes in one picture and handles blurry or tilted shots.
  let zxingReady = null;
  function zxing() {
    if (zxingReady) return zxingReady;
    zxingReady = (async function () {
      if (!window.ZXingWASM) return null;
      const wasm = new URL('vendor/zxing/zxing_reader.wasm', location.href).href;
      await window.ZXingWASM.prepareZXingModule({
        overrides: { locateFile: function (path, prefix) { return path.endsWith('.wasm') ? wasm : prefix + path; } },
        fireImmediately: true
      });
      return window.ZXingWASM;
    })().catch(function () { return null; });
    return zxingReady;
  }

  async function zxingRead(input, many) {
    const z = await zxing();
    if (!z) return null;
    const out = await z.readBarcodes(input, { formats: ['QRCode', 'MicroQRCode'], tryHarder: true, maxNumberOfSymbols: many ? 8 : 1 });
    return out.filter(function (r) { return r.isValid && r.text; }).map(function (r) { return r.text; });
  }

  async function decodeImage(blob) {
    const found = [];
    function add(list) { (list || []).forEach(function (t) { if (found.indexOf(t) < 0) found.push(t); }); }
    try { add(await zxingRead(blob, true)); } catch (e) { /* try the others */ }
    const bitmap = await createImageBitmap(blob);
    const det = await getDetector();
    if (det) {
      try { add((await det.detect(bitmap)).map(function (c) { return c.rawValue; }).filter(Boolean)); }
      catch (e) { /* use jsQR below */ }
    }
    if (!found.length) {
      for (const side of [1200, 800, 2000, 500]) {
        const hit = jsqrFrom(bitmap, bitmap.width, bitmap.height, side);
        if (hit) { found.push(hit); break; }
      }
    }
    bitmap.close && bitmap.close();
    return found;
  }

  // ---------- camera ----------

  async function startCamera() {
    $('camNote').textContent = '';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $('camNote').textContent = 'This browser has no camera access. Use Scan a picture.';
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false
      });
    } catch (e) {
      stream = null;
      $('camNote').textContent = e && e.name === 'NotAllowedError'
        ? 'Camera blocked. Allow it in the site settings of your browser, then tap Start camera.'
        : e && e.name === 'NotFoundError' ? 'No camera found. Use Scan a picture.' : 'The camera could not start. Use Scan a picture.';
      return;
    }
    video.srcObject = stream;
    try { await video.play(); } catch (e) { /* autoplay is allowed for muted video */ }
    viewfinder.classList.add('live');
    setupTorch();
    scanning = true;
    loop();
  }

  function stopCamera() {
    scanning = false;
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null;
    video.srcObject = null;
    viewfinder.classList.remove('live');
    $('torchBtn').hidden = true;
  }

  function setupTorch() {
    const btn = $('torchBtn');
    const track = stream && stream.getVideoTracks()[0];
    let caps = {};
    try { caps = track && track.getCapabilities ? track.getCapabilities() : {}; } catch (e) { caps = {}; }
    if (!caps.torch) { btn.hidden = true; return; }
    btn.hidden = false;
    btn.setAttribute('aria-pressed', 'false');
    btn.onclick = async function () {
      const on = btn.getAttribute('aria-pressed') !== 'true';
      try {
        await track.applyConstraints({ advanced: [{ torch: on }] });
        btn.setAttribute('aria-pressed', String(on));
      } catch (e) { btn.hidden = true; }
    };
  }

  async function loop() {
    if (!scanning) return;
    if (!sheetOpen && video.readyState >= 2 && video.videoWidth) {
      let raw = null;
      const det = await getDetector();
      try {
        if (det) {
          const codes = await det.detect(video);
          if (codes.length) raw = codes[0].rawValue;
        } else {
          const side = 720;
          const scale = Math.min(1, side / Math.max(video.videoWidth, video.videoHeight));
          const w = Math.round(video.videoWidth * scale), h = Math.round(video.videoHeight * scale);
          work.width = w; work.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          const z = await zxingRead(img, false).catch(function () { return null; });
          if (z && z.length) raw = z[0];
          else if (z === null) {
            const hit = window.jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
            raw = hit && hit.data ? hit.data : null;
          }
        }
      } catch (e) { raw = null; }
      if (raw && !(raw === lastRaw && Date.now() - lastAt < 2500)) {
        lastRaw = raw; lastAt = Date.now();
        if (navigator.vibrate) navigator.vibrate(40);
        show([raw]);
      }
    }
    setTimeout(loop, detector ? 150 : 220);
  }

  // ---------- result sheet ----------

  const PILL = { danger: 'Danger', caution: 'Caution', clear: 'Clear', pay: 'Payment', none: 'Clear' };

  const RANK = { danger: 0, caution: 1, pay: 2, clear: 3, none: 3 };

  function show(raws) {
    if (!raws.length) return;
    sheetOpen = true;
    $('toast').classList.remove('show');
    // Put the riskiest code first when a picture holds more than one.
    raws = raws.slice().sort(function (a, b) {
      return RANK[window.QRAnalyze.analyze(a).verdict] - RANK[window.QRAnalyze.analyze(b).verdict];
    });
    const many = $('rMany');
    many.innerHTML = '';
    many.hidden = raws.length < 2;
    if (raws.length > 1) {
      raws.forEach(function (raw, i) {
        const r = window.QRAnalyze.analyze(raw);
        const b = document.createElement('button');
        b.className = 'chip';
        b.textContent = 'Code ' + (i + 1) + ': ' + PILL[r.verdict];
        b.onclick = function () { render(raw); mark(i); };
        many.appendChild(b);
      });
      const warn = document.createElement('p');
      warn.className = 'note';
      warn.style.width = '100%';
      warn.textContent = raws.length + ' codes in this picture. Check each one, since a sticker can sit next to the real code.';
      many.appendChild(warn);
    }
    function mark(i) {
      Array.prototype.forEach.call(many.querySelectorAll('button'), function (b, j) { b.setAttribute('aria-pressed', String(i === j)); });
    }
    raws.forEach(remember);
    render(raws[0]);
    if (raws.length > 1) mark(0);
    $('sheetBg').hidden = false;
    $('sheet').hidden = false;
    $('sheet').scrollTop = 0;
    $('againBtn').focus({ preventScroll: true });
  }

  function render(raw) {
    const r = window.QRAnalyze.analyze(raw);
    const sheet = $('sheet');
    const verdict = r.verdict === 'none' ? 'clear' : r.verdict;
    sheet.className = 'sheet ' + verdict;
    $('rPill').textContent = PILL[verdict];
    $('rKind').textContent = r.label;
    $('rTitle').textContent = r.title;

    const site = $('rSite');
    if (r.site && r.site.reg) {
      site.hidden = false;
      $('rReg').textContent = r.site.reg;
      const full = (r.site.sub ? r.site.sub + '.' : '') + r.site.reg;
      $('rFull').textContent = r.site.decoded ? 'Reads as ' + r.site.decoded : full !== r.site.reg ? full : '';
    } else site.hidden = true;

    const list = $('rFindings');
    list.innerHTML = '';
    r.findings.forEach(function (f) {
      const li = document.createElement('li');
      li.className = f.level;
      li.textContent = f.text;
      list.appendChild(li);
    });
    list.hidden = !r.findings.length;

    const dl = $('rDetails');
    dl.innerHTML = '';
    // A payment code leads with who gets the money.
    if (r.kind === 'payment') sheet.insertBefore(dl, list); else sheet.insertBefore(dl, list.nextSibling);
    r.details.forEach(function (d) {
      const wrap = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = d.label;
      dd.textContent = d.value;
      if (d.big) dd.classList.add('big');
      if (d.mono) dd.classList.add('mono');
      wrap.appendChild(dt); wrap.appendChild(dd);
      dl.appendChild(wrap);
    });
    dl.hidden = !r.details.length;

    const actions = $('rActions');
    actions.innerHTML = '';
    r.actions.forEach(function (a, i) {
      const b = document.createElement('button');
      b.className = 'btn' + (a.type === 'open' && verdict !== 'danger' && i === 0 ? ' gold' : '') + (a.confirm ? ' ghost' : '');
      b.textContent = a.label;
      b.onclick = function () { act(a); };
      actions.appendChild(b);
    });
    actions.hidden = !r.actions.length;
    $('rNote').hidden = !r.browserNote;
  }

  function closeSheet() {
    sheetOpen = false;
    $('sheet').hidden = true;
    $('sheetBg').hidden = true;
    lastAt = Date.now();
  }

  async function act(a) {
    if (a.type === 'copy') {
      try { await navigator.clipboard.writeText(a.value); toast('Copied'); }
      catch (e) { toast('Copy blocked by the browser'); }
      return;
    }
    if (a.type === 'contact') {
      const blob = new Blob([a.value], { type: 'text/vcard' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'contact.vcf';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      return;
    }
    if (a.type === 'open') {
      if (a.confirm && !(await ask(a.confirm))) return;
      if (/^https?:/i.test(a.value)) window.open(a.value, '_blank', 'noopener,noreferrer');
      else window.location.href = a.value;
    }
  }

  function ask(text) {
    const box = $('confirmBox');
    $('confirmText').textContent = text;
    return new Promise(function (resolve) {
      function done(v) { box.close(); $('confirmYes').onclick = $('confirmNo').onclick = null; resolve(v); }
      $('confirmYes').onclick = function () { done(true); };
      $('confirmNo').onclick = function () { done(false); };
      box.oncancel = function () { resolve(false); };
      box.showModal();
      $('confirmNo').focus();
    });
  }

  let toastTimer = 0;
  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  // ---------- recent scans ----------

  const KEY = 'qr-protect-history';

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  }

  function saveHistory(items) {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* storage off */ }
  }

  function remember(raw) {
    const r = window.QRAnalyze.analyze(raw);
    if (!r) return;
    const items = loadHistory().filter(function (h) { return h.raw !== raw; });
    items.unshift({ raw: raw, verdict: r.verdict === 'none' ? 'clear' : r.verdict, title: r.title, label: r.label, at: Date.now() });
    saveHistory(items.slice(0, 25));
    drawHistory();
  }

  function ago(t) {
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'now';
    if (m < 60) return m + 'm';
    const h = Math.round(m / 60);
    if (h < 24) return h + 'h';
    return Math.round(h / 24) + 'd';
  }

  function drawHistory() {
    const items = loadHistory();
    $('historyBox').hidden = !items.length;
    const ul = $('historyList');
    ul.innerHTML = '';
    items.forEach(function (h) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      const dot = document.createElement('span');
      dot.className = 'dot ' + h.verdict;
      const main = document.createElement('span');
      main.className = 'h-main';
      const title = document.createElement('span');
      title.className = 'h-title';
      title.textContent = h.title;
      const raw = document.createElement('span');
      raw.className = 'h-raw';
      raw.textContent = h.raw.replace(/\s+/g, ' ').slice(0, 120);
      main.appendChild(title); main.appendChild(raw);
      const time = document.createElement('span');
      time.className = 'h-time';
      time.textContent = ago(h.at);
      b.appendChild(dot); b.appendChild(main); b.appendChild(time);
      b.onclick = function () { show([h.raw]); };
      li.appendChild(b);
      ul.appendChild(li);
    });
  }

  // ---------- pictures, pasted text and shared items ----------

  async function scanFile(file) {
    if (!file) return;
    toast('Reading ' + (file.name || 'picture'));
    let found = [];
    try { found = await decodeImage(file); }
    catch (e) { toast((file.name || 'The picture') + ' could not be opened.'); return; }
    if (!found.length) { toast('No QR code found in ' + (file.name || 'the picture') + '.'); return; }
    show(found);
  }

  async function readShared() {
    const params = new URLSearchParams(location.search);
    if (!params.has('shared')) return;
    history.replaceState(null, '', location.pathname);
    try {
      const cache = await caches.open('qr-protect-share');
      const img = await cache.match('shared-image');
      const txt = await cache.match('shared-text');
      if (img) { const blob = await img.blob(); await cache.delete('shared-image'); scanFile(new File([blob], 'shared picture', { type: blob.type })); return; }
      if (txt) { const t = await txt.text(); await cache.delete('shared-text'); if (t.trim()) show([t.trim()]); }
    } catch (e) { toast('The shared item could not be read.'); }
  }

  function readQueryText() {
    const params = new URLSearchParams(location.search);
    const t = params.get('url') || params.get('text') || '';
    if (t.trim()) { history.replaceState(null, '', location.pathname); show([t.trim()]); }
  }

  // ---------- wiring ----------

  $('startCam').onclick = startCamera;
  $('filePick').onchange = function (e) { scanFile(e.target.files[0]); e.target.value = ''; };
  $('textForm').onsubmit = function (e) {
    e.preventDefault();
    const t = $('textIn').value.trim();
    if (!t) { $('textIn').focus(); return; }
    $('textIn').blur();
    show([t]);
  };
  $('againBtn').onclick = closeSheet;
  $('sheetBg').onclick = closeSheet;
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sheetOpen && !$('confirmBox').open) closeSheet(); });
  $('clearHistory').onclick = function () { saveHistory([]); drawHistory(); };

  document.addEventListener('paste', function (e) {
    if (document.activeElement === $('textIn')) return;
    const items = e.clipboardData ? e.clipboardData.items : [];
    for (const it of items) {
      if (it.type.indexOf('image/') === 0) { scanFile(it.getAsFile()); e.preventDefault(); return; }
    }
    const t = e.clipboardData && e.clipboardData.getData('text');
    if (t && t.trim()) { show([t.trim()]); e.preventDefault(); }
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (stream) { stopCamera(); viewfinder.dataset.resume = '1'; } }
    else if (viewfinder.dataset.resume) { delete viewfinder.dataset.resume; startCamera(); }
  });

  let installEvent = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvent = e; $('installBtn').hidden = false; });
  $('installBtn').onclick = async function () {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    installEvent = null;
    $('installBtn').hidden = true;
  };

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function () { /* runs without offline support */ });
  }

  drawHistory();
  readShared();
  readQueryText();

  // Start the camera straight away when permission was already given.
  (async function () {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const p = await navigator.permissions.query({ name: 'camera' });
        if (p.state === 'granted') startCamera();
      }
    } catch (e) { /* the button stays */ }
  })();
})();
