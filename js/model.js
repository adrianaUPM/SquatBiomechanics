/*
 * Modelo biomecánico 2D (plano sagital) — educativo, no clínico.
 *
 * Convenciones: unidades en cm, eje X hacia delante (la persona mira a la derecha),
 * eje Y hacia arriba, suelo en y = 0, tobillo en x = 0.
 *
 * Grados de libertad de la pose:
 *   s     inclinación de la tibia respecto a la vertical (rodilla hacia delante > 0)
 *   phi   inclinación del fémur respecto a la vertical (cadera hacia atrás > 0; 90° = paralelo)
 *   a     inclinación del torso respecto a la vertical (hacia delante > 0)
 *
 * Restricción principal: el centro de masas combinado (cuerpo + barra) sobre el mediopié.
 */
const BM = (() => {
  const DEG = Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const V = (x, y) => ({ x, y });
  const add = (a, b) => V(a.x + b.x, a.y + b.y);
  const sub = (a, b) => V(a.x - b.x, a.y - b.y);
  const mul = (a, k) => V(a.x * k, a.y * k);
  const len = (a) => Math.hypot(a.x, a.y);
  const unit = (a) => { const l = len(a) || 1; return V(a.x / l, a.y / l); };
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const angleBetween = (a, b) =>
    Math.acos(clamp(dot(a, b) / ((len(a) * len(b)) || 1), -1, 1)) / DEG;

  // Longitudes medias como fracción de la altura (Winter / Drillis-Contini).
  const FRAC = {
    F: 0.245, T: 0.246, L: 0.288, ankleH: 0.039, headNeck: 0.182,
    ua: 0.186, fa: 0.146, hand: 0.108, foot: 0.152,
  };

  // Fracciones de masa y posición del CdM (de Leva, 1996, simplificado).
  const MASS = {
    male: {
      head: 0.0694, trunk: 0.4346, ua: 0.0271, fa: 0.0162, hand: 0.0061,
      thigh: 0.1416, shank: 0.0433, foot: 0.0137,
      thighCom: 0.4095, shankCom: 0.4459, trunkCom: 0.55,
    },
    female: {
      head: 0.0668, trunk: 0.4257, ua: 0.0255, fa: 0.0138, hand: 0.0056,
      thigh: 0.1478, shank: 0.0481, foot: 0.0129,
      thighCom: 0.3612, shankCom: 0.4416, trunkCom: 0.58,
    },
  };
  const LOAD = 1.0; // carga de la barra relativa al peso corporal

  const LIMITS = { F: [28, 64], T: [28, 62], L: [34, 72], H: [140, 215] };

  function defaultBody(H, sex) {
    const b = { sex };
    for (const k in FRAC) b[k] = FRAC[k] * H;
    return b;
  }

  function presetBody(H, sex, f, t, l) {
    const b = defaultBody(H, sex);
    b.F = f * H; b.T = t * H; b.L = l * H;
    return b;
  }

  const heightOf = (b) => b.ankleH + b.T + b.F + b.L + b.headNeck;

  function footGeom(b) {
    const heel = -0.24 * b.foot, toe = 0.76 * b.foot;
    return { heel, toe, mid: (heel + toe) / 2 };
  }

  // Codo por cinemática inversa de dos segmentos (se elige la solución inferior).
  function ik(S, W, u, f) {
    const d0 = sub(W, S);
    const dir = unit(d0);
    const d = clamp(len(d0), Math.abs(u - f) + 0.01, u + f - 0.01);
    const a = (u * u - f * f + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, u * u - a * a));
    const P = add(S, mul(dir, a));
    const perp = V(-dir.y, dir.x);
    const e1 = add(P, mul(perp, h)), e2 = add(P, mul(perp, -h));
    return e1.y < e2.y ? e1 : e2;
  }

  function buildPose(b, ex, s, phi, a) {
    const Hh = heightOf(b);
    const A = V(0, b.ankleH);
    const K = V(A.x + b.T * Math.sin(s), A.y + b.T * Math.cos(s));
    const H = V(K.x - b.F * Math.sin(phi), K.y + b.F * Math.cos(phi));
    const td = V(Math.sin(a), Math.cos(a)); // dirección del torso
    const n = V(td.y, -td.x);                // normal "hacia delante" del torso
    const S = add(H, mul(td, b.L));
    const nd = unit(V(td.x, td.y + 0.45));   // cuello: columna neutra con algo de extensión
    const neck = add(S, add(mul(td, 0.015 * Hh), mul(n, -0.012 * Hh)));
    const headR = 0.36 * b.headNeck;
    const headC = add(neck, mul(nd, 0.52 * b.headNeck));
    let E, W, bar;
    if (ex === 'squat') {
      // Barra alta sobre los trapecios; el brazo se ve acortado de perfil (agarre ancho).
      bar = add(S, add(mul(n, -0.035 * Hh), mul(td, 0.028 * Hh)));
      W = add(bar, mul(n, 0.004 * Hh));
      // codo hacia abajo y atrás; el brazo se ve acortado de perfil
      E = add(S, mul(add(mul(td, -0.8), mul(n, -0.6)), 0.6 * b.ua));
    } else {
      // RDL: brazos colgando en vertical, barra en las manos.
      E = V(S.x, S.y - b.ua);
      W = V(S.x, S.y - b.ua - b.fa);
      bar = V(S.x, W.y - 0.4 * b.hand);
    }
    const f = footGeom(b);
    return {
      A, K, H, S, td, n, neck, nd, headC, headR, E, W, bar,
      heel: V(f.heel, 0), toe: V(f.toe, 0), midX: f.mid, height: Hh,
      s, phi, a,
    };
  }

  function comOf(b, P) {
    const m = MASS[b.sex];
    let sx = 0, sy = 0, sm = 0;
    const acc = (pt, mm) => { sx += pt.x * mm; sy += pt.y * mm; sm += mm; };
    acc(V((P.heel.x + P.toe.x) / 2, b.ankleH * 0.4), 2 * m.foot);
    acc(add(P.K, mul(sub(P.A, P.K), m.shankCom)), 2 * m.shank);
    acc(add(P.H, mul(sub(P.K, P.H), m.thighCom)), 2 * m.thigh);
    acc(add(P.H, mul(sub(P.S, P.H), m.trunkCom)), m.trunk);
    acc(P.headC, m.head);
    acc(add(P.S, mul(sub(P.E, P.S), 0.43)), 2 * m.ua);
    acc(add(P.E, mul(sub(P.W, P.E), 0.46)), 2 * m.fa);
    acc(P.W, 2 * m.hand);
    acc(P.bar, LOAD);
    return V(sx / sm, sy / sm);
  }

  // CdM de todo lo que queda por encima de la zona lumbar (para los erectores).
  function upperComOf(b, P) {
    const m = MASS[b.sex];
    let sx = 0, sy = 0, sm = 0;
    const acc = (pt, mm) => { sx += pt.x * mm; sy += pt.y * mm; sm += mm; };
    acc(add(P.H, mul(sub(P.S, P.H), 0.68)), m.trunk * 0.65);
    acc(P.headC, m.head);
    acc(add(P.S, mul(sub(P.W, P.S), 0.45)), 2 * (m.ua + m.fa + m.hand));
    acc(P.bar, LOAD);
    return V(sx / sm, sy / sm);
  }

  function anglesOf(P) {
    return {
      hip: angleBetween(sub(P.S, P.H), sub(P.K, P.H)),
      knee: angleBetween(sub(P.H, P.K), sub(P.A, P.K)),
      ankle: angleBetween(sub(P.K, P.A), V(1, 0)),
      torso: Math.atan2(P.td.x, P.td.y) / DEG,
    };
  }

  /* ---------------- SENTADILLA ----------------
   * Para cada profundidad (phi) hay un grado de libertad libre tras imponer el
   * equilibrio: cuánto avanza la rodilla (s). El torso (a) se obtiene de la
   * condición de equilibrio. Elegimos s minimizando un coste que prefiere
   * un torso vertical pero penaliza fuertemente acercarse al límite de
   * dorsiflexión del tobillo. Así, fémures largos → más rodilla + más torso;
   * fémures cortos → sentadilla vertical sin agotar el tobillo.
   */
  const SQ = { phiB: 100 * DEG, aMax: 85 * DEG, wA: 40 * DEG, wS: 0.6 };

  function squatAlpha(b, s, phi, target) {
    const f = (a) => comOf(b, buildPose(b, 'squat', s, phi, a)).x - target;
    if (f(0) > 0) return null; // el CdM ya va por delante: esta s no es viable
    if (f(SQ.aMax) < 0) return { a: SQ.aMax, ok: false };
    let lo = 0, hi = SQ.aMax;
    for (let i = 0; i < 24; i++) {
      const m = (lo + hi) / 2;
      if (f(m) < 0) lo = m; else hi = m;
    }
    return { a: (lo + hi) / 2, ok: true };
  }

  function squatFrame(b, p, sMax, com0, mid) {
    const phi = SQ.phiB * p;
    const target = lerp(com0, mid, smooth(p / 0.3));
    const sLo = -4 * DEG, sHi = sMax;
    const evalS = (s) => {
      const r = squatAlpha(b, s, phi, target);
      if (!r) return { c: Infinity, s, a: 0, ok: true };
      const c = (r.a / SQ.wA) ** 2 + SQ.wS * Math.pow(Math.max(0, s) / sMax, 6) + (r.ok ? 0 : 50);
      return { c, s, a: r.a, ok: r.ok };
    };
    const N = 16;
    const step = (sHi - sLo) / N;
    let best = null;
    for (let i = 0; i <= N; i++) {
      const r = evalS(sLo + step * i);
      if (!best || r.c < best.c) best = r;
    }
    if (best.c === Infinity) return { s: sLo, phi, a: 0, ok: true };
    // refinamiento ternario alrededor del mejor punto de la malla
    let lo = Math.max(sLo, best.s - step), hi = Math.min(sHi, best.s + step);
    for (let i = 0; i < 12; i++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      if (evalS(m1).c < evalS(m2).c) hi = m2; else lo = m1;
    }
    const r = evalS((lo + hi) / 2);
    const fin = r.c <= best.c ? r : best;
    return { s: fin.s, phi, a: fin.a, ok: fin.ok };
  }

  /* ---------------- PESO MUERTO RUMANO ----------------
   * El torso se inclina de forma progresiva; la rodilla mantiene una flexión
   * suave. La cadera se desplaza hacia atrás (phi) lo necesario para mantener
   * el equilibrio. La posición inferior se alcanza cuando la barra llega a
   * media tibia o cuando la flexión de cadera alcanza el límite de isquios.
   */
  const RD = { kSoft: 18 * DEG, sMin: -6 * DEG, phiMax: 80 * DEG, hipMin: 62 };

  function rdlFrameAt(b, a, k, target) {
    const sOf = (phi) => Math.max(k - phi, RD.sMin);
    const f = (phi) => comOf(b, buildPose(b, 'rdl', sOf(phi), phi, a)).x - target;
    if (f(0) <= 0) return { s: sOf(0), phi: 0, a, ok: true };
    if (f(RD.phiMax) > 0) return { s: sOf(RD.phiMax), phi: RD.phiMax, a, ok: false };
    let lo = 0, hi = RD.phiMax;
    for (let i = 0; i < 26; i++) {
      const m = (lo + hi) / 2;
      if (f(m) > 0) lo = m; else hi = m;
    }
    const phi = (lo + hi) / 2;
    return { s: sOf(phi), phi, a, ok: true };
  }

  function rdlBottom(b, mid) {
    const plateR = 22.5;
    let deg = 5, reason = 'max';
    for (; deg <= 88; deg += 0.5) {
      const fr = rdlFrameAt(b, deg * DEG, RD.kSoft, mid);
      const P = buildPose(b, 'rdl', fr.s, fr.phi, fr.a);
      const midShin = (P.A.y + P.K.y) / 2;
      const hip = anglesOf(P).hip;
      if (P.bar.y <= midShin) { reason = 'bar'; break; }
      if (P.bar.y <= plateR + 1) { reason = 'floor'; break; }
      if (hip <= RD.hipMin) { reason = 'hams'; break; }
    }
    return { a: Math.min(deg, 88) * DEG, reason };
  }

  const NP = 61;

  function buildRep(b, ex, opts) {
    const mid = footGeom(b).mid;
    const com0 = comOf(b, buildPose(b, ex, 0, 0, 0)).x;
    const frames = [];
    const meta = {};
    if (ex === 'squat') {
      const sMax = opts.ankle * DEG;
      meta.sMax = sMax;
      for (let i = 0; i < NP; i++) frames.push(squatFrame(b, i / (NP - 1), sMax, com0, mid));
    } else {
      const bottom = rdlBottom(b, mid);
      meta.reason = bottom.reason;
      for (let i = 0; i < NP; i++) {
        const p = i / (NP - 1);
        const k = RD.kSoft * smooth(p / 0.3);
        const target = lerp(com0, mid, smooth(p / 0.3));
        frames.push(rdlFrameAt(b, bottom.a * p, k, target));
      }
    }
    return { ex, b, frames, mid, meta };
  }

  function frameAt(rep, p) {
    const x = clamp(p, 0, 1) * (NP - 1);
    const i = Math.min(NP - 2, Math.floor(x));
    const u = x - i;
    const f0 = rep.frames[i], f1 = rep.frames[i + 1];
    const P = buildPose(rep.b, rep.ex, lerp(f0.s, f1.s, u), lerp(f0.phi, f1.phi, u), lerp(f0.a, f1.a, u));
    P.ok = f0.ok && f1.ok;
    return P;
  }

  // Línea temporal de una repetición: bajada → pausa en el fondo → subida.
  const PH = { down: 0.42, hold: 0.52 };
  const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(x, 0, 1));
  function tToP(t) {
    if (t < PH.down) return ease(t / PH.down);
    if (t < PH.hold) return 1;
    return ease(1 - (t - PH.hold) / (1 - PH.hold));
  }

  // Demanda muscular relativa aproximada a partir de brazos de momento.
  function musclesOf(b, P, ex) {
    const Hh = P.height;
    const com = comOf(b, P);
    const up = upperComOf(b, P);
    const ang = anglesOf(P);
    const kneeArm = Math.max(0, P.K.x - com.x);
    const hipArm = Math.max(0, com.x - P.H.x);
    const backArm = Math.max(0, up.x - P.H.x);
    const soft = (x) => Math.tanh(Math.max(0, x));
    const hipD = soft(hipArm / (0.19 * Hh));
    const hipFlex = clamp((180 - ang.hip) / 110, 0, 1);
    const kneeExt = clamp((ang.knee - 50) / 120, 0, 1);
    const base = 0.06;
    return {
      quads: base + (1 - base) * soft(kneeArm / (0.11 * Hh)),
      glutes: base + (1 - base) * hipD * (0.65 + 0.35 * hipFlex),
      hams: base + (1 - base) * hipD * (0.3 + 0.7 * kneeExt),
      erectors: base + (1 - base) * soft(backArm / (0.19 * Hh)),
      com,
    };
  }

  const NT = 121;
  function analyze(rep) {
    const samples = [];
    const sum = { maxTorso: 0, minHip: 180, minKnee: 180, minAnkle: 180, kneeFwd: -Infinity, hipBack: 0, ok: true };
    for (let i = 0; i < NT; i++) {
      const t = i / (NT - 1);
      const P = frameAt(rep, tToP(t));
      const ang = anglesOf(P);
      const mus = musclesOf(rep.b, P, rep.ex);
      samples.push({ t, ang, mus });
      sum.maxTorso = Math.max(sum.maxTorso, ang.torso);
      sum.minHip = Math.min(sum.minHip, ang.hip);
      sum.minKnee = Math.min(sum.minKnee, ang.knee);
      sum.minAnkle = Math.min(sum.minAnkle, ang.ankle);
      sum.kneeFwd = Math.max(sum.kneeFwd, P.K.x - P.toe.x);
      sum.hipBack = Math.max(sum.hipBack, -P.H.x);
      if (!P.ok) sum.ok = false;
    }
    // trayectorias (fase descendente)
    const barPath = [], hipPath = [], kneePath = [];
    for (let i = 0; i <= 40; i++) {
      const P = frameAt(rep, i / 40);
      barPath.push(P.bar); hipPath.push(P.H); kneePath.push(P.K);
    }
    return { samples, sum, barPath, hipPath, kneePath };
  }

  return {
    DEG, FRAC, LIMITS, PH,
    defaultBody, presetBody, heightOf, footGeom, buildPose, comOf,
    anglesOf, musclesOf, buildRep, frameAt, tToP, analyze,
    util: { V, add, sub, mul, len, unit, dot, lerp, clamp, smooth },
  };
})();

if (typeof module !== 'undefined') module.exports = BM;
