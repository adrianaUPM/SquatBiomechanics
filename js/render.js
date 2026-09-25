/* Dibujo del avatar de perfil, arcos de ángulos, músculos y controles sobre el cuerpo. */
const Render = (() => {
  const { V, add, sub, mul, unit, lerp, clamp } = BM.util;

  const COLORS = {
    hip: '#ff8a3d', knee: '#4f8cff', ankle: '#2ec4b6', torso: '#b76bff',
    body: '#cdd6e2', bodyShade: '#b7c2d1', outline: '#6f7f95', shoe: '#2b3544',
    hair: '#3a2e2a', balance: '#ffd166', accent: '#35d6f0', bar: '#e8edf3',
  };

  let ctx, cw = 0, ch = 0, sc = 1, ox = 0, oy = 0;
  let refH = 200;
  const setRef = (H) => { refH = Math.max(185, H) + 12; };

  function fit(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    cw = r.width; ch = r.height;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sc = Math.min(cw / (refH * 0.95), (ch - 36) / refH);
    ox = cw * 0.5 + 0.1 * refH * sc;
    oy = ch - 26;
  }

  const S = (p) => ({ x: ox + p.x * sc, y: oy - p.y * sc });
  const toWorld = (x, y) => V((x - ox) / sc, (oy - y) / sc);

  /* ---------- utilidades de forma ---------- */

  // perfil de anchura interpolado (coseno) a partir de puntos de control [t, w]
  function prof(pts, t) {
    if (t <= pts[0][0]) return pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      if (t <= pts[i + 1][0]) {
        const u = (t - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
        return lerp(pts[i][1], pts[i + 1][1], (1 - Math.cos(Math.PI * u)) / 2);
      }
    }
    return pts[pts.length - 1][1];
  }

  // contorno de un segmento: P0 distal → P1 proximal; "front" es el lado anterior
  function limb(P0, P1, front, back, scale, n = 14) {
    const d = unit(sub(P1, P0));
    const nn = V(d.y, -d.x);
    const f = [], b = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const c = add(P0, mul(sub(P1, P0), t));
      f.push(add(c, mul(nn, prof(front, t) * scale)));
      b.push(add(c, mul(nn, -prof(back, t) * scale)));
    }
    return f.concat(b.reverse());
  }

  // banda muscular dentro de un segmento, entre dos fracciones de la anchura
  function band(P0, P1, profile, scale, t0, t1, fIn, fOut, sign, n = 14) {
    const d = unit(sub(P1, P0));
    const nn = V(d.y, -d.x);
    const outer = [], inner = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const t = lerp(t0, t1, u);
      const c = add(P0, mul(sub(P1, P0), t));
      const w = prof(profile, t) * scale * sign;
      const oIn = w * fIn, oOut = w * fOut, m = (oIn + oOut) / 2;
      const tp = Math.pow(Math.sin(Math.PI * u), 0.55);
      outer.push(add(c, mul(nn, m + (oOut - m) * tp)));
      inner.push(add(c, mul(nn, m + (oIn - m) * tp)));
    }
    return outer.concat(inner.reverse());
  }

  function smoothPath(pts) {
    const s = pts.map(S);
    const n = s.length;
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const m0 = mid(s[n - 1], s[0]);
    ctx.beginPath();
    ctx.moveTo(m0.x, m0.y);
    for (let i = 0; i < n; i++) {
      const p = s[i], m = mid(p, s[(i + 1) % n]);
      ctx.quadraticCurveTo(p.x, p.y, m.x, m.y);
    }
    ctx.closePath();
  }

  function ellipsePath(e) {
    const c = S(e.c);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, e.rx * sc, e.ry * sc, -Math.atan2(e.dir.y, e.dir.x), 0, Math.PI * 2);
  }

  function shapePath(sh) {
    if (sh.type === 'ell') ellipsePath(sh); else smoothPath(sh.pts);
  }

  /* ---------- perfiles corporales (fracción de la altura) ---------- */
  const PR = {
    shankF: [[0, 0.016], [0.5, 0.019], [1, 0.027]],
    shankB: [[0, 0.019], [0.25, 0.027], [0.65, 0.04], [0.86, 0.035], [1, 0.03]],
    thighF: [[0, 0.028], [0.3, 0.04], [0.62, 0.047], [0.9, 0.044], [1, 0.04]],
    thighB: [[0, 0.03], [0.4, 0.04], [0.8, 0.045], [1, 0.045]],
    torsoF_m: [[0, 0.04], [0.15, 0.05], [0.42, 0.05], [0.7, 0.061], [0.86, 0.055], [1, 0.028]],
    torsoB_m: [[0, 0.058], [0.2, 0.05], [0.4, 0.042], [0.7, 0.056], [0.88, 0.05], [1, 0.028]],
    torsoF_f: [[0, 0.042], [0.15, 0.047], [0.42, 0.042], [0.64, 0.07], [0.76, 0.058], [0.9, 0.044], [1, 0.026]],
    torsoB_f: [[0, 0.062], [0.2, 0.052], [0.4, 0.038], [0.7, 0.05], [0.88, 0.046], [1, 0.026]],
    uarm: [[0, 0.024], [0.5, 0.027], [1, 0.029]],
    farm: [[0, 0.017], [0.6, 0.022], [1, 0.023]],
    neck: [[0, 0.03], [1, 0.026]],
  };

  function buildShapes(P, sex) {
    const Hh = P.height;
    const fem = sex === 'female';
    const lw = fem ? 0.93 : 1;
    const thighW = fem ? 1.04 : 1;
    const g = {};
    // pie / zapatilla
    const fl = P.toe.x - P.heel.x, heel = P.heel.x, toe = P.toe.x, ah = P.A.y;
    g.foot = { type: 'poly', fill: COLORS.shoe, pts: [
      V(heel + 0.03 * fl, 0), V(toe - 0.05 * fl, 0), V(toe, 0.03 * fl), V(toe - 0.1 * fl, 0.1 * fl),
      V(0.36 * fl, 0.19 * fl), V(0.1 * fl, ah + 0.05 * fl), V(-0.12 * fl, ah + 0.05 * fl),
      V(heel + 0.02 * fl, 0.5 * ah), V(heel, 0.07 * fl),
    ] };
    g.shank = { type: 'poly', pts: limb(P.A, P.K, PR.shankF, PR.shankB, Hh * lw) };
    const dT = unit(sub(P.H, P.K)), nT = V(dT.y, -dT.x);
    g.thigh = { type: 'poly', pts: limb(add(P.K, mul(dT, -0.01 * Hh)), add(P.H, mul(dT, 0.02 * Hh)), PR.thighF, PR.thighB, Hh * thighW) };
    const gk = fem ? 1.12 : 1;
    g.glute = { type: 'ell', c: add(P.H, add(mul(nT, -0.036 * Hh * gk), mul(dT, -0.028 * Hh))), rx: 0.058 * Hh * gk, ry: 0.05 * Hh * gk, dir: dT };
    const T0 = add(P.H, mul(P.td, -0.03 * Hh)), T1 = add(P.S, mul(P.td, 0.035 * Hh));
    const tF = fem ? PR.torsoF_f : PR.torsoF_m, tB = fem ? PR.torsoB_f : PR.torsoB_m;
    g.torso = { type: 'poly', pts: limb(T0, T1, tF, tB, Hh), P0: T0, P1: T1, tB };
    g.neck = { type: 'poly', pts: limb(P.neck, P.headC, PR.neck, PR.neck, Hh * lw) };
    g.head = { type: 'ell', c: P.headC, rx: P.headR * 1.02, ry: P.headR * 0.9, dir: P.nd };
    g.uarm = { type: 'poly', pts: limb(P.E, add(P.S, mul(unit(sub(P.S, P.E)), 0.01 * Hh)), PR.uarm, PR.uarm, Hh * lw) };
    g.farm = { type: 'poly', pts: limb(P.W, P.E, PR.farm, PR.farm, Hh * lw) };
    // músculos
    const thP0 = P.K, thP1 = P.H;
    g.mQuads = band(thP0, thP1, PR.thighF, Hh * thighW, 0.1, 0.95, 0.15, 0.86, 1);
    g.mHams = band(thP0, thP1, PR.thighB, Hh * thighW, 0.08, 0.82, 0.12, 0.86, -1);
    g.mErect = band(T0, T1, tB, Hh, 0.1, 0.66, 0.4, 0.9, -1);
    g.mGlute = { ...g.glute, rx: g.glute.rx * 0.84, ry: g.glute.ry * 0.8 };
    return g;
  }

  function muscleColor(v, a = 1) {
    v = clamp(v, 0, 1);
    const r = Math.round(lerp(246, 236, v)), gg = Math.round(lerp(178, 32, v)), b = Math.round(lerp(150, 72, v));
    return `rgba(${r},${gg},${b},${(0.22 + 0.74 * v) * a})`;
  }

  /* ---------- escena ---------- */

  function drawBackground(Hh) {
    ctx.clearRect(0, 0, cw, ch);
    // cuadrícula cada 10 cm
    ctx.lineWidth = 1;
    for (let x = -100; x <= 100; x += 10) {
      const p = S(V(x, 0));
      ctx.strokeStyle = x % 50 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.025)';
      ctx.beginPath(); ctx.moveTo(p.x, 0); ctx.lineTo(p.x, oy); ctx.stroke();
    }
    for (let y = 10; y <= 230; y += 10) {
      const p = S(V(0, y));
      ctx.strokeStyle = y % 50 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.025)';
      ctx.beginPath(); ctx.moveTo(0, p.y); ctx.lineTo(cw, p.y); ctx.stroke();
    }
    // suelo
    const f = S(V(0, 0));
    const grd = ctx.createLinearGradient(0, f.y, 0, ch);
    grd.addColorStop(0, 'rgba(255,255,255,0.07)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd; ctx.fillRect(0, f.y, cw, ch - f.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, f.y); ctx.lineTo(cw, f.y); ctx.stroke();
  }

  function drawPlate(P) {
    const c = S(P.bar), R = 22.5 * sc;
    ctx.fillStyle = 'rgba(70,82,102,0.42)';
    ctx.strokeStyle = 'rgba(170,184,204,0.55)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(c.x, c.y, R * 0.72, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(170,184,204,0.22)'; ctx.stroke();
  }

  function drawBarEnd(P) {
    const c = S(P.bar);
    ctx.fillStyle = COLORS.bar; ctx.strokeStyle = '#11161d'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(4, 2.6 * sc), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  function drawPath(pts, color, dash) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dash); ctx.lineCap = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => { const s = S(p); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); });
    ctx.stroke(); ctx.restore();
  }

  function drawGhostLines(P) {
    ctx.save();
    ctx.setLineDash([5, 4]); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(140,200,255,0.8)';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    [P.A, P.K, P.H, P.S].forEach((p, i) => { const s = S(p); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); });
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(140,200,255,0.9)';
    [P.K, P.H, P.S].forEach((p) => { const s = S(p); ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, Math.PI * 2); ctx.fill(); });
    ctx.restore();
  }

  function drawGhost(P) {
    const Hh = P.height;
    ctx.save();
    ctx.strokeStyle = 'rgba(140,200,255,0.20)';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = 0.075 * Hh * sc;
    ctx.beginPath();
    [P.A, P.K, P.H, add(P.S, mul(P.td, 0.02 * Hh))].forEach((p, i) => { const s = S(p); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); });
    ctx.stroke();
    const h = S(P.headC);
    ctx.fillStyle = 'rgba(140,200,255,0.16)';
    ctx.beginPath(); ctx.arc(h.x, h.y, P.headR * sc, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawBody(P, sex, mus) {
    const g = buildShapes(P, sex);
    const core = [g.shank, g.thigh, g.glute, g.torso, g.neck, g.head, g.foot];
    ctx.save();
    ctx.lineJoin = 'round';
    // pasada de contorno (silueta unificada)
    ctx.strokeStyle = COLORS.outline; ctx.lineWidth = 3;
    core.forEach((sh) => { shapePath(sh); ctx.stroke(); });
    // relleno
    core.forEach((sh) => {
      shapePath(sh);
      ctx.fillStyle = sh.fill || COLORS.body;
      ctx.fill();
    });
    // músculos
    const mdraw = (path, v, isEll) => {
      ctx.save();
      ctx.shadowColor = muscleColor(v, 0.9);
      ctx.shadowBlur = 16 * v;
      if (isEll) ellipsePath(path); else smoothPath(path);
      ctx.fillStyle = muscleColor(v);
      ctx.fill();
      ctx.restore();
    };
    mdraw(g.mErect, mus.erectors);
    mdraw(g.mHams, mus.hams);
    mdraw(g.mQuads, mus.quads);
    mdraw(g.mGlute, mus.glutes, true);
    // cabeza: pelo y rasgos
    drawHeadDetails(P, sex);
    // brazo cercano
    ctx.strokeStyle = COLORS.outline; ctx.lineWidth = 3;
    [g.uarm, g.farm].forEach((sh) => { shapePath(sh); ctx.stroke(); });
    [g.uarm, g.farm].forEach((sh) => { shapePath(sh); ctx.fillStyle = COLORS.bodyShade; ctx.fill(); });
    const hand = S(add(P.W, mul(unit(sub(P.W, P.E)), 0.3 * 0.108 * P.height)));
    ctx.beginPath(); ctx.arc(hand.x, hand.y, 0.022 * P.height * sc, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.bodyShade; ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawHeadDetails(P, sex) {
    const Hh = P.height;
    const nd = P.nd, nf = V(nd.y, -nd.x); // eje de la cabeza y dirección de la cara
    const c = P.headC, r = P.headR;
    // pelo (recortado a la cabeza)
    ctx.save();
    ellipsePath({ c, rx: r * 1.02, ry: r * 0.9, dir: nd });
    ctx.clip();
    ctx.fillStyle = COLORS.hair;
    const hc = S(add(c, add(mul(nf, -0.42 * r), mul(nd, 0.42 * r))));
    ctx.beginPath(); ctx.arc(hc.x, hc.y, r * (sex === 'female' ? 1.0 : 0.88) * sc, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (sex === 'female') {
      // coleta
      const a = S(add(c, add(mul(nf, -0.78 * r), mul(nd, 0.35 * r))));
      const b = S(add(c, add(mul(nf, -1.35 * r), mul(nd, -0.2 * r))));
      const e = S(add(c, add(mul(nf, -1.15 * r), mul(nd, -1.0 * r))));
      ctx.strokeStyle = COLORS.hair; ctx.lineCap = 'round';
      ctx.lineWidth = 0.028 * Hh * sc;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(b.x, b.y, e.x, e.y); ctx.stroke();
      ctx.fillStyle = COLORS.hair;
      ctx.beginPath(); ctx.arc(a.x, a.y, 0.018 * Hh * sc, 0, Math.PI * 2); ctx.fill();
    }
    // nariz
    const n0 = S(add(c, add(mul(nf, 0.96 * r), mul(nd, 0.05 * r))));
    const n1 = S(add(c, add(mul(nf, 1.2 * r), mul(nd, -0.12 * r))));
    const n2 = S(add(c, add(mul(nf, 0.96 * r), mul(nd, -0.25 * r))));
    ctx.fillStyle = COLORS.body; ctx.strokeStyle = COLORS.outline; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(n0.x, n0.y); ctx.lineTo(n1.x, n1.y); ctx.lineTo(n2.x, n2.y); ctx.fill(); ctx.stroke();
    // ojo
    const eye = S(add(c, add(mul(nf, 0.62 * r), mul(nd, 0.12 * r))));
    ctx.fillStyle = '#2a3340';
    ctx.beginPath(); ctx.arc(eye.x, eye.y, Math.max(1.5, 0.006 * Hh * sc), 0, Math.PI * 2); ctx.fill();
  }

  function drawBalance(P, com, ok) {
    const x = S(V(P.midX, 0)).x;
    const top = S(V(0, P.height * 1.08)).y;
    ctx.save();
    ctx.strokeStyle = ok ? COLORS.balance : '#ff5470';
    ctx.globalAlpha = 0.85;
    ctx.setLineDash([7, 6]); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x, oy); ctx.lineTo(x, top); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '600 10px Inter, system-ui, sans-serif';
    ctx.fillStyle = ok ? COLORS.balance : '#ff5470';
    ctx.textAlign = 'center';
    ctx.fillText('MEDIOPIÉ', x, top - 8);
    // símbolo de centro de masas
    const c = S(com), r = 6;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#11161d'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#11161d';
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.arc(c.x, c.y, r, -Math.PI / 2, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.arc(c.x, c.y, r, Math.PI / 2, Math.PI); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function pill(text, x, y, color) {
    ctx.font = '700 12px Inter, system-ui, sans-serif';
    const w = ctx.measureText(text).width + 12, h = 20;
    ctx.fillStyle = 'rgba(12,16,22,0.88)';
    ctx.strokeStyle = color; ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, 10); else ctx.rect(x - w / 2, y - h / 2, w, h);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 0.5);
    ctx.textBaseline = 'alphabetic';
  }

  function arc(center, v1, v2, rPx, color, value, labelDist = 18) {
    const c = S(center);
    const a1 = Math.atan2(-v1.y, v1.x), a2 = Math.atan2(-v2.y, v2.x);
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.arc(c.x, c.y, rPx, a1, a1 + d, d < 0); ctx.closePath();
    ctx.fillStyle = color + '2e'; ctx.fill();
    ctx.beginPath(); ctx.arc(c.x, c.y, rPx, a1, a1 + d, d < 0);
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();
    const am = a1 + d / 2;
    pill(`${Math.round(value)}°`, c.x + Math.cos(am) * (rPx + labelDist), c.y + Math.sin(am) * (rPx + labelDist), color);
  }

  function drawAngles(P, ang) {
    const Hh = P.height, k = Hh * sc;
    // referencia vertical para el torso
    const top = add(P.H, V(0, 0.2 * Hh));
    const h = S(P.H), t = S(top);
    ctx.save();
    ctx.setLineDash([3, 4]); ctx.strokeStyle = COLORS.torso + 'aa'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(t.x, t.y); ctx.stroke();
    ctx.restore();
    arc(P.H, V(0, 1), P.td, 0.13 * k, COLORS.torso, ang.torso, 20);
    arc(P.H, sub(P.S, P.H), sub(P.K, P.H), 0.055 * k, COLORS.hip, ang.hip, 22);
    arc(P.K, sub(P.H, P.K), sub(P.A, P.K), 0.05 * k, COLORS.knee, ang.knee, 20);
    arc(P.A, sub(P.K, P.A), V(1, 0), 0.042 * k, COLORS.ankle, ang.ankle, 18);
  }

  const JOINTS = [
    { key: 'S', name: 'HOMBRO', dx: -30, dy: -18, align: 'right' },
    { key: 'H', name: 'CADERA', dx: -16, dy: 22, align: 'right' },
    { key: 'K', name: 'RODILLA', dx: 14, dy: 20, align: 'left' },
    { key: 'A', name: 'TOBILLO', dx: -14, dy: 18, align: 'right' },
  ];

  function drawJoints(P, showLabels) {
    ctx.save();
    for (const j of JOINTS) {
      const p = S(P[j.key]);
      ctx.fillStyle = '#0f141b'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (showLabels) {
        ctx.font = '600 9.5px Inter, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(210,220,235,0.72)';
        ctx.textAlign = j.align;
        ctx.fillText(j.name, p.x + j.dx, p.y + j.dy);
      }
    }
    ctx.restore();
  }

  // Controles de arrastre: eje del movimiento en coordenadas del mundo
  function handleDefs(P) {
    return [
      { id: 'knee', at: P.K, axis: unit(sub(P.A, P.H)), tip: 'Fémur ↔ Tibia' },
      { id: 'hip', at: P.H, axis: P.td, tip: 'Piernas ↔ Torso' },
      { id: 'shoulder', at: P.S, axis: P.td, tip: 'Longitud del torso' },
    ];
  }

  function drawHandles(P, hover, active) {
    for (const h of handleDefs(P)) {
      const c = S(h.at);
      const ax = unit(V(h.axis.x, -h.axis.y)); // eje en pantalla
      const on = hover === h.id || active === h.id;
      const d = on ? 21 : 17, sz = on ? 7 : 5.5;
      ctx.save();
      ctx.fillStyle = on ? COLORS.accent : 'rgba(53,214,240,0.75)';
      ctx.strokeStyle = 'rgba(8,12,18,0.9)'; ctx.lineWidth = 1.2;
      for (const sgn of [1, -1]) {
        const tip = { x: c.x + ax.x * (d + sz) * sgn, y: c.y + ax.y * (d + sz) * sgn };
        const bs = { x: c.x + ax.x * d * sgn, y: c.y + ax.y * d * sgn };
        const px = -ax.y * sz, py = ax.x * sz;
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y); ctx.lineTo(bs.x + px, bs.y + py); ctx.lineTo(bs.x - px, bs.y - py);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      if (on) {
        ctx.strokeStyle = COLORS.accent; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(c.x, c.y, 10, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function hitHandle(P, x, y) {
    let best = null, bd = 22;
    for (const h of handleDefs(P)) {
      const c = S(h.at);
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  function drawTooltip(x, y, lines) {
    ctx.save();
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 18;
    const h = lines.length * 17 + 10;
    let bx = x + 16, by = y - h - 10;
    if (bx + w > cw - 6) bx = x - w - 16;
    if (by < 6) by = y + 16;
    ctx.fillStyle = 'rgba(10,14,20,0.94)'; ctx.strokeStyle = COLORS.accent; ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, w, h, 8); else ctx.rect(bx, by, w, h);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8f6fb'; ctx.textAlign = 'left';
    lines.forEach((l, i) => ctx.fillText(l, bx + 9, by + 20 + i * 17));
    ctx.restore();
  }

  function draw(scene) {
    const { P, sex, ang, mus, ghost, paths, hover, active, tooltip, ex } = scene;
    drawBackground(P.height);
    if (paths) {
      drawPath(paths.hipPath, 'rgba(255,138,61,0.55)', [2, 5]);
      drawPath(paths.barPath, 'rgba(232,237,243,0.6)', [2, 5]);
    }
    drawPlate(P);
    if (ghost) drawGhost(ghost);
    drawBody(P, sex, mus);
    drawBarEnd(P);
    if (ghost) drawGhostLines(ghost);
    drawBalance(P, mus.com, P.ok);
    drawAngles(P, ang);
    drawJoints(P, true);
    drawHandles(P, hover, active);
    if (tooltip) drawTooltip(tooltip.x, tooltip.y, tooltip.lines);
  }

  return { fit, setRef, draw, hitHandle, toWorld, COLORS, muscleColor };
})();
