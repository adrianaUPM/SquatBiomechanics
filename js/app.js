/* Estado de la app, controles, reproducción y gráfico de ángulos. */
(() => {
  const { clamp, sub, dot } = BM.util;
  const $ = (id) => document.getElementById(id);
  const LIM = BM.LIMITS;

  const PRESETS = {
    avg: [0.245, 0.246, 0.288],
    longF: [0.27, 0.235, 0.275],
    shortF: [0.22, 0.255, 0.304],
    longL: [0.23, 0.23, 0.319],
  };
  const DEFAULT_H = { male: 178, female: 165 };
  const DURATION = 3.6; // s por repetición a 1×

  const st = {
    ex: 'squat',
    sex: 'male',
    body: BM.defaultBody(DEFAULT_H.male, 'male'),
    ankle: 38,
    t: 0,
    playing: false,
    speed: 1,
    loop: false,
    ghost: false,
    trace: true,
    hover: null,
    drag: null,
    view: '2d',
  };

  let rep, ana, ghostRep = null, ghostKey = '';
  let dirty = true;

  /* ---------- cálculo ---------- */
  function recompute() {
    rep = BM.buildRep(st.body, st.ex, { ankle: st.ankle });
    ana = BM.analyze(rep);
    if (st.ghost) {
      const H = Math.round(BM.heightOf(st.body) * 10) / 10;
      const key = [st.ex, st.sex, H, st.ankle].join('|');
      if (key !== ghostKey) {
        ghostRep = BM.buildRep(BM.defaultBody(H, st.sex), st.ex, { ankle: st.ankle });
        ghostKey = key;
      }
    }
    dirty = false;
    const newRef = BM.heightOf(st.body);
    if (!st.drag) { Render.setRef(newRef); if (st.view === '2d') Render.fit(cv); }
    syncControls();
    renderSummary();
  }
  const invalidate = () => { dirty = true; };

  /* ---------- controles del panel ---------- */
  const sliders = {
    F: { el: $('sF'), v: $('vF'), p: $('pF') },
    T: { el: $('sT'), v: $('vT'), p: $('pT') },
    L: { el: $('sL'), v: $('vL'), p: $('pL') },
  };
  for (const k in sliders) {
    const s = sliders[k];
    s.el.min = LIM[k][0]; s.el.max = LIM[k][1];
    s.el.addEventListener('input', () => {
      st.body[k] = +s.el.value;
      invalidate();
    });
  }

  function setFill(el) {
    const f = ((+el.value - +el.min) / (+el.max - +el.min)) * 100;
    el.style.setProperty('--fill', f + '%');
  }

  function setHeight(H) {
    H = clamp(H, LIM.H[0], LIM.H[1]);
    const k = H / BM.heightOf(st.body);
    for (const key of Object.keys(BM.FRAC)) st.body[key] *= k;
    for (const key of ['F', 'T', 'L']) st.body[key] = clamp(st.body[key], LIM[key][0], LIM[key][1]);
    invalidate();
  }
  $('hRange').addEventListener('input', (e) => setHeight(+e.target.value));
  $('hNum').addEventListener('change', (e) => setHeight(+e.target.value || 175));

  $('sAnk').addEventListener('input', (e) => { st.ankle = +e.target.value; invalidate(); });

  function syncControls() {
    const H = BM.heightOf(st.body);
    for (const k in sliders) {
      const s = sliders[k];
      if (document.activeElement !== s.el) s.el.value = st.body[k];
      setFill(s.el);
      s.v.textContent = st.body[k].toFixed(1);
      s.p.textContent = `${((st.body[k] / H) * 100).toFixed(1)}%`;
    }
    const hr = $('hRange');
    if (document.activeElement !== hr) hr.value = Math.round(H);
    setFill(hr);
    if (document.activeElement !== $('hNum')) $('hNum').value = Math.round(H);
    $('sAnk').value = st.ankle; setFill($('sAnk'));
    $('vAnk').textContent = st.ankle;
    $('ankleBlock').style.display = st.ex === 'squat' ? '' : 'none';
    $('rFT').textContent = (st.body.F / st.body.T).toFixed(2);
    $('rFL').textContent = (st.body.F / st.body.L).toFixed(2);
  }

  function segSwitch(container, attr, onPick) {
    container.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      container.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      onPick(b.dataset[attr]);
    });
  }
  segSwitch($('exSwitch'), 'ex', (v) => { st.ex = v; reset(); invalidate(); });
  segSwitch($('sexSwitch'), 'sex', (v) => { st.sex = v; st.body.sex = v; invalidate(); });
  segSwitch($('speed'), 's', (v) => { st.speed = +v; });

  $('presets').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const H = BM.heightOf(st.body);
    st.body = BM.presetBody(H, st.sex, ...PRESETS[b.dataset.p]);
    invalidate();
  });

  $('optGhost').addEventListener('change', (e) => { st.ghost = e.target.checked; ghostKey = ''; invalidate(); });
  $('optTrace').addEventListener('change', (e) => { st.trace = e.target.checked; });
  $('optLoop').addEventListener('change', (e) => { st.loop = e.target.checked; });

  /* ---------- reproducción ---------- */
  const tl = $('tl');
  function play() {
    if (st.t >= 1) st.t = 0;
    st.playing = true;
    $('bPlay').classList.add('active');
  }
  function pause() { st.playing = false; $('bPlay').classList.remove('active'); }
  function reset() { pause(); st.t = 0; }
  $('bPlay').addEventListener('click', play);
  $('bPause').addEventListener('click', pause);
  $('bReset').addEventListener('click', reset);
  tl.addEventListener('input', () => { pause(); st.t = +tl.value / 1000; });

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type === 'number') return;
    if (e.code === 'Space') { e.preventDefault(); st.playing ? pause() : play(); }
    if (e.code === 'ArrowRight' && e.target.type !== 'range') { pause(); st.t = clamp(st.t + 0.01, 0, 1); }
    if (e.code === 'ArrowLeft' && e.target.type !== 'range') { pause(); st.t = clamp(st.t - 0.01, 0, 1); }
  });

  /* ---------- arrastre sobre el avatar ---------- */
  const cv = $('cv');
  let currentPose = null;

  function applyDrag(id, d) {
    const b = st.body;
    if (id === 'knee') {
      // rodilla hacia el tobillo → fémur más largo, tibia más corta (pierna constante)
      const nF = clamp(b.F + d, LIM.F[0], LIM.F[1]);
      const nT = clamp(b.T - (nF - b.F), LIM.T[0], LIM.T[1]);
      const real = b.T - nT;
      b.F += real; b.T = nT;
    } else if (id === 'hip') {
      // cadera hacia arriba → piernas más largas, torso más corto (altura constante)
      const legs = b.F + b.T;
      const nL = clamp(b.L - d, LIM.L[0], LIM.L[1]);
      const dl = b.L - nL;
      const k = (legs + dl) / legs;
      const nF = b.F * k, nT = b.T * k;
      if (nF < LIM.F[0] || nF > LIM.F[1] || nT < LIM.T[0] || nT > LIM.T[1]) return;
      b.F = nF; b.T = nT; b.L = nL;
    } else if (id === 'shoulder') {
      b.L = clamp(b.L + d, LIM.L[0], LIM.L[1]);
    }
    invalidate();
  }

  function pointerPos(e) {
    const r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  cv.addEventListener('pointerdown', (e) => {
    if (!currentPose) return;
    const p = pointerPos(e);
    const h = Render.hitHandle(currentPose, p.x, p.y);
    if (!h) return;
    pause();
    cv.setPointerCapture(e.pointerId);
    st.drag = { id: h.id, axis: h.axis, last: Render.toWorld(p.x, p.y), x: p.x, y: p.y };
    $('hint').classList.add('gone');
  });
  cv.addEventListener('pointermove', (e) => {
    const p = pointerPos(e);
    if (st.drag) {
      const w = Render.toWorld(p.x, p.y);
      const d = dot(sub(w, st.drag.last), st.drag.axis);
      st.drag.last = w; st.drag.x = p.x; st.drag.y = p.y;
      if (Math.abs(d) > 1e-4) applyDrag(st.drag.id, d);
      return;
    }
    const h = currentPose && Render.hitHandle(currentPose, p.x, p.y);
    st.hover = h ? h.id : null;
    cv.style.cursor = h ? 'grab' : 'default';
  });
  const endDrag = () => { st.drag = null; };
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', () => { if (!st.drag) st.hover = null; });

  /* ---------- vista 3D ---------- */
  const cv3d = $('cv3d');
  const b3d = $('b3d');
  let init3d = false;
  if (!View3D.available) { b3d.disabled = true; b3d.title = 'No se pudo cargar Three.js (requiere conexión)'; }

  function setView(v) {
    if (v === '3d' && !View3D.available) return;
    st.view = v;
    const is3d = v === '3d';
    if (is3d && !init3d) { View3D.init(cv3d); init3d = true; }
    cv.hidden = is3d;
    cv3d.hidden = !is3d;
    $('cam3d').hidden = !is3d;
    cv.parentElement.classList.toggle('is3d', is3d);
    b3d.classList.toggle('on', is3d);
    b3d.textContent = is3d ? '◧ 2D' : '◈ 3D';
    b3d.title = is3d ? 'Volver a la vista 2D' : 'Ver la animación en 3D';
    st.hover = null; st.drag = null;
    resize();
  }
  b3d.addEventListener('click', () => setView(st.view === '3d' ? '2d' : '3d'));

  // joystick: la desviación del mando fija la velocidad de giro de la cámara
  const joy = $('joy'), knob = $('joyKnob');
  let joyId = null;
  function joyMove(e) {
    const r = joy.getBoundingClientRect();
    const R = r.width / 2 - 14;
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    View3D.setJoy(dx / R, dy / R);
  }
  joy.addEventListener('pointerdown', (e) => {
    joyId = e.pointerId; joy.setPointerCapture(joyId); joy.classList.add('active'); joyMove(e);
  });
  joy.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) joyMove(e); });
  const joyEnd = (e) => {
    if (e.pointerId !== joyId) return;
    joyId = null; joy.classList.remove('active');
    knob.style.transform = ''; View3D.setJoy(0, 0);
  };
  joy.addEventListener('pointerup', joyEnd);
  joy.addEventListener('pointercancel', joyEnd);
  $('cam3d').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.zoom) View3D.zoomBy(+b.dataset.zoom);
    if (b.dataset.view) View3D.setView(b.dataset.view);
  });

  /* ---------- lecturas ---------- */
  const muscleEls = {};
  document.querySelectorAll('.mus').forEach((el) => { muscleEls[el.dataset.m] = el.querySelector('i'); });

  function renderReadouts(ang, mus) {
    $('aHip').textContent = Math.round(ang.hip) + '°';
    $('aKnee').textContent = Math.round(ang.knee) + '°';
    $('aAnkle').textContent = Math.round(ang.ankle) + '°';
    $('aTorso').textContent = Math.round(ang.torso) + '°';
    for (const k in muscleEls) {
      muscleEls[k].style.width = Math.round(mus[k] * 100) + '%';
    }
  }

  function renderSummary() {
    const s = ana.sum;
    const cells = [];
    const add = (label, val, wide) => cells.push(`<div class="${wide ? 'wide' : ''}"><span>${label}</span><b>${val}</b></div>`);
    if (st.ex === 'squat') {
      const style = s.maxTorso < 34 ? 'Sentadilla vertical' : s.maxTorso < 44 ? 'Patrón mixto' : 'Dominante de cadera (torso inclinado)';
      add('Patrón', style, true);
      add('Torso máx.', Math.round(s.maxTorso) + '°');
      add('Rodilla mín.', Math.round(s.minKnee) + '°');
      add('Rodilla vs puntera', (s.kneeFwd >= 0 ? '+' : '') + s.kneeFwd.toFixed(0) + ' cm');
      add('Cadera atrás', s.hipBack.toFixed(0) + ' cm');
      $('styleBadge').innerHTML = `Squat · torso máx. <b>${Math.round(s.maxTorso)}°</b>`;
    } else {
      const reason = { bar: 'Barra bajo la rodilla', hams: 'Límite de isquios', floor: 'Discos tocan el suelo', max: 'Inclinación máxima' }[rep.meta.reason] || '';
      add('Posición inferior', reason, true);
      add('Torso máx.', Math.round(s.maxTorso) + '°');
      add('Cadera mín.', Math.round(s.minHip) + '°');
      add('Rodilla mín.', Math.round(s.minKnee) + '°');
      add('Cadera atrás', s.hipBack.toFixed(0) + ' cm');
      $('styleBadge').innerHTML = `RDL · torso máx. <b>${Math.round(s.maxTorso)}°</b>`;
    }
    $('summary').innerHTML = cells.join('');
    $('warn').classList.toggle('show', !s.ok);
  }

  /* ---------- gráfico de ángulos ---------- */
  const chart = $('chart');
  function drawChart() {
    const dpr = window.devicePixelRatio || 1;
    const r = chart.getBoundingClientRect();
    if (chart.width !== Math.round(r.width * dpr)) { chart.width = Math.round(r.width * dpr); chart.height = Math.round(r.height * dpr); }
    const c = chart.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = r.width, h = r.height, pl = 26, pr = 6, pt = 8, pb = 16;
    c.clearRect(0, 0, w, h);
    const X = (t) => pl + t * (w - pl - pr);
    const Y = (v) => pt + (1 - v / 180) * (h - pt - pb);
    // fondo de fase inferior
    c.fillStyle = 'rgba(255,255,255,0.04)';
    c.fillRect(X(BM.PH.down), pt, X(BM.PH.hold) - X(BM.PH.down), h - pt - pb);
    c.font = '9.5px Inter, sans-serif'; c.fillStyle = '#6e7d91'; c.textAlign = 'right';
    for (const v of [0, 90, 180]) {
      c.strokeStyle = 'rgba(255,255,255,0.07)';
      c.beginPath(); c.moveTo(pl, Y(v)); c.lineTo(w - pr, Y(v)); c.stroke();
      c.fillText(v + '°', pl - 4, Y(v) + 3);
    }
    const series = [['hip', Render.COLORS.hip], ['knee', Render.COLORS.knee], ['ankle', Render.COLORS.ankle], ['torso', Render.COLORS.torso]];
    c.lineWidth = 2; c.lineJoin = 'round';
    for (const [k, col] of series) {
      c.strokeStyle = col;
      c.beginPath();
      ana.samples.forEach((s, i) => { const x = X(s.t), y = Y(s.ang[k]); i ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.stroke();
    }
    const cx = X(st.t);
    c.strokeStyle = '#fff'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(cx, pt); c.lineTo(cx, h - pb); c.stroke();
    c.fillStyle = '#6e7d91'; c.textAlign = 'left'; c.fillText('Inicio', pl, h - 3);
    c.textAlign = 'right'; c.fillText('Final', w - pr, h - 3);
  }

  /* ---------- bucle principal ---------- */
  function resize() {
    if (st.view === '3d') View3D.resize(); else Render.fit(cv);
  }
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(cv.parentElement);

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (dirty) recompute();
    if (st.playing) {
      st.t += (dt / DURATION) * st.speed;
      if (st.t >= 1) {
        if (st.loop) st.t -= 1; else { st.t = 1; pause(); }
      }
    }
    if (document.activeElement !== tl || st.playing) tl.value = Math.round(st.t * 1000);
    tl.style.setProperty('--fill', st.t * 100 + '%');

    const p = BM.tToP(st.t);
    const P = BM.frameAt(rep, p);
    currentPose = P;
    const ang = BM.anglesOf(P);
    const mus = BM.musclesOf(st.body, P, st.ex);
    let tooltip = null;
    if (st.drag) {
      const b = st.body;
      const lines = st.drag.id === 'knee'
        ? [`Fémur ${b.F.toFixed(1)} cm`, `Tibia ${b.T.toFixed(1)} cm`]
        : st.drag.id === 'hip'
          ? [`Piernas ${(b.F + b.T).toFixed(1)} cm`, `Torso ${b.L.toFixed(1)} cm`]
          : [`Torso ${b.L.toFixed(1)} cm`, `Altura ${BM.heightOf(b).toFixed(0)} cm`];
      tooltip = { x: st.drag.x, y: st.drag.y, lines };
    }
    if (st.view === '3d') {
      View3D.draw({ P, sex: st.sex, mus, ex: st.ex });
    } else {
      Render.draw({
        P, sex: st.sex, ang, mus, ex: st.ex,
        ghost: st.ghost && ghostRep ? BM.frameAt(ghostRep, p) : null,
        paths: st.trace ? ana : null,
        hover: st.hover, active: st.drag && st.drag.id, tooltip,
      });
    }
    renderReadouts(ang, mus);
    drawChart();
    requestAnimationFrame(frame);
  }

  // estado inicial opcional desde la URL: #ex=rdl&t=0.45&sex=female&preset=longF
  const hp = new URLSearchParams(location.hash.slice(1));
  if (hp.get('sex')) $('sexSwitch').querySelector(`[data-sex="${hp.get('sex')}"]`)?.click();
  if (hp.get('ex')) $('exSwitch').querySelector(`[data-ex="${hp.get('ex')}"]`)?.click();
  if (hp.get('preset')) $('presets').querySelector(`[data-p="${hp.get('preset')}"]`)?.click();
  if (hp.get('t')) st.t = clamp(+hp.get('t'), 0, 1);
  if (hp.get('ghost')) { $('optGhost').checked = true; st.ghost = true; }
  if (hp.get('view') === '3d') setView('3d');

  resize();
  recompute();
  setTimeout(() => $('hint').classList.add('gone'), 9000);
  requestAnimationFrame(frame);
})();
