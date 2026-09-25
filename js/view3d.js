/*
 * Vista 3D del avatar (Three.js). Reutiliza la pose sagital del modelo 2D:
 * eje X hacia delante, Y hacia arriba y Z lateral (cm). Las piernas se separan
 * según la anchura de apoyo y los brazos se resuelven con IK de dos segmentos.
 */
const View3D = (() => {
  if (typeof THREE === 'undefined') return { available: false };

  const DEG = Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const P3 = (p, z = 0) => V3(p.x, p.y, z);

  const SKIN = new THREE.Color('#cdd6e2');
  const SKIN2 = new THREE.Color('#b9c4d3');

  // perfil interpolado (coseno) a partir de puntos [t, valor]
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

  /* ---------- perfiles 3D (semianchura como fracción de la altura) ---------- */
  // F = anterior, B = posterior, L = lateral
  const SH = {
    shank: {
      F: [[0, 0.016], [0.5, 0.019], [0.9, 0.024], [1, 0.022]],
      B: [[0, 0.018], [0.2, 0.022], [0.45, 0.036], [0.68, 0.04], [0.86, 0.033], [1, 0.024]],
      L: [[0, 0.018], [0.3, 0.022], [0.62, 0.031], [0.85, 0.028], [1, 0.024]],
    },
    thigh: {
      F: [[0, 0.022], [0.12, 0.034], [0.3, 0.039], [0.62, 0.046], [0.9, 0.044], [1, 0.04]],
      B: [[0, 0.023], [0.15, 0.03], [0.4, 0.039], [0.8, 0.043], [1, 0.042]],
      L: [[0, 0.024], [0.15, 0.034], [0.55, 0.042], [0.88, 0.046], [1, 0.045]],
    },
    torso_m: {
      F: [[0, 0.04], [0.15, 0.047], [0.42, 0.048], [0.62, 0.053], [0.74, 0.058], [0.86, 0.052], [1, 0.03]],
      B: [[0, 0.046], [0.2, 0.044], [0.4, 0.039], [0.7, 0.052], [0.88, 0.048], [1, 0.03]],
      L: [[0, 0.098], [0.2, 0.093], [0.36, 0.084], [0.6, 0.094], [0.8, 0.108], [0.92, 0.1], [1, 0.05]],
    },
    torso_f: {
      F: [[0, 0.042], [0.15, 0.046], [0.42, 0.04], [0.56, 0.046], [0.65, 0.056], [0.76, 0.05], [0.9, 0.041], [1, 0.028]],
      B: [[0, 0.048], [0.2, 0.044], [0.4, 0.035], [0.7, 0.046], [0.88, 0.043], [1, 0.028]],
      L: [[0, 0.106], [0.2, 0.099], [0.38, 0.076], [0.6, 0.084], [0.8, 0.094], [0.92, 0.088], [1, 0.045]],
    },
    uarm: { F: [[0, 0.022], [0.5, 0.026], [1, 0.03]], B: [[0, 0.022], [0.5, 0.028], [1, 0.03]], L: [[0, 0.021], [0.5, 0.024], [1, 0.028]] },
    farm: { F: [[0, 0.015], [0.6, 0.021], [1, 0.022]], B: [[0, 0.015], [0.6, 0.021], [1, 0.022]], L: [[0, 0.013], [0.6, 0.018], [1, 0.02]] },
    neck: { F: [[0, 0.03], [1, 0.026]], B: [[0, 0.03], [1, 0.026]], L: [[0, 0.034], [1, 0.028]] },
  };

  /*
   * Segmento de cuerpo: tubo a lo largo de +Y (0..1) con sección definida por
   * perfiles anterior (+X), posterior (−X) y lateral (±Z) y extremos redondeados.
   * "zones" asigna a cada vértice un peso por músculo para colorear la activación.
   */
  function segGeom(pr, zones = {}, radial = 28, rings = 26, cap = 0.07) {
    const pts = [];
    for (let i = 0; i <= rings; i++) pts.push(new THREE.Vector2(1, -cap + (1 + 2 * cap) * (i / rings)));
    const geo = new THREE.LatheGeometry(pts, radial);
    const pos = geo.attributes.position;
    const n = pos.count;
    const w = {};
    for (const m in zones) w[m] = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const ang = Math.atan2(z, x);
      const c = Math.cos(ang), s = Math.sin(ang);
      const t = clamp(y, 0, 1);
      const f = prof(pr.F, t), b = prof(pr.B, t), l = prof(pr.L, t);
      let k = 1;
      if (y < 0) k = Math.sqrt(Math.max(0, 1 - (y / cap) ** 2));
      if (y > 1) k = Math.sqrt(Math.max(0, 1 - ((y - 1) / cap) ** 2));
      const rx = c >= 0 ? f : b;
      pos.setXYZ(i, c * rx * k, y, s * l * k);
      for (const m in zones) w[m][i] = zones[m](t, c, s);
    }
    geo.computeVertexNormals();
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = SKIN.r; col[i * 3 + 1] = SKIN.g; col[i * 3 + 2] = SKIN.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.userData.w = w;
    return geo;
  }

  /*
   * Glúteo mayor: esfera deformada. En coordenadas locales X apunta hacia atrás
   * (fuera del cuerpo) e Y hacia abajo; la parte superior se afina hacia la zona
   * lumbar, el pliegue inferior queda redondeado y la cara medial se aplana.
   */
  function gluteGeom(side) {
    const g = new THREE.SphereGeometry(1, 36, 26);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const up = -y;
      if (up > 0) { if (x > 0) x *= 1 - 0.55 * up; z *= 1 - 0.12 * up; }
      else if (x > 0) x *= 1 + 0.1 * Math.min(1, -up * 1.5) * (1 + up);
      if (z * side < 0) z *= 0.62;
      pos.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  }

  const bell = (t, a, b) => (t <= a || t >= b ? 0 : Math.pow(Math.sin(Math.PI * (t - a) / (b - a)), 0.6));

  // activación → color (misma escala que la vista 2D)
  function mcol(v) {
    v = clamp(v, 0, 1);
    return { c: new THREE.Color(lerp(246, 236, v) / 255, lerp(178, 32, v) / 255, lerp(150, 72, v) / 255), a: 0.22 + 0.74 * v };
  }

  function paint(geo, mus) {
    const w = geo.userData.w;
    const col = geo.attributes.color;
    const n = col.count;
    const ms = Object.keys(w).map((m) => [w[m], mcol(mus[m])]);
    for (let i = 0; i < n; i++) {
      let r = SKIN.r, g = SKIN.g, b = SKIN.b;
      for (const [arr, mc] of ms) {
        const a = arr[i] * mc.a;
        if (a <= 0) continue;
        r = lerp(r, mc.c.r, a); g = lerp(g, mc.c.g, a); b = lerp(b, mc.c.b, a);
      }
      col.setXYZ(i, r, g, b);
    }
    col.needsUpdate = true;
  }

  /* ---------- escena ---------- */
  let renderer, scene, camera, canvas, fig = null, figSex = '';
  let cam = { yaw: 38 * DEG, pitch: 12 * DEG, dist: 1, zoom: 1 };
  let joy = { x: 0, y: 0 };
  let lastT = performance.now();
  let target = V3(0, 90, 0);

  const skinMat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.02 });
  const flatMat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.05, ...o });

  function init(cv) {
    canvas = cv;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, 1, 5, 5000);

    scene.add(new THREE.HemisphereLight(0xdfeaff, 0x1a2230, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(160, 320, 220);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0008;
    key.shadow.normalBias = 0.6;
    Object.assign(key.shadow.camera, { left: -160, right: 160, top: 160, bottom: -160, near: 50, far: 900 });
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x6fd8ff, 0.35);
    rim.position.set(-200, 180, -200);
    scene.add(rim);

    // suelo
    const floor = new THREE.Mesh(new THREE.CircleGeometry(260, 64), new THREE.MeshStandardMaterial({ color: 0x131b26, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(500, 50, 0x2c3a4d, 0x1c2633);
    grid.position.y = 0.05;
    scene.add(grid);

    // línea del mediopié y centro de masas (siempre visibles)
    const lg = new THREE.BufferGeometry().setFromPoints([V3(0, 0, 0), V3(0, 1, 0)]);
    scene.userData.mid = new THREE.Line(lg, new THREE.LineDashedMaterial({ color: 0xffd166, dashSize: 4, gapSize: 3, transparent: true, opacity: 0.55 }));
    scene.userData.mid.computeLineDistances();
    scene.userData.mid.renderOrder = 10;
    scene.add(scene.userData.mid);
    const com = new THREE.Mesh(new THREE.SphereGeometry(1.8, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffd166, depthTest: false, transparent: true, opacity: 0.9 }));
    com.renderOrder = 11;
    scene.add(com);
    scene.userData.com = com;

    bindPointer();
  }

  /* ---------- figura ---------- */
  function mesh(geo, mat, shadow = true) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    return m;
  }

  function buildFigure(sex) {
    if (fig) scene.remove(fig.root);
    const fem = sex === 'female';
    const root = new THREE.Group();
    const f = { root, sex, segs: [], paint: [] };
    const add = (m) => { root.add(m); return m; };

    const quads = (t, c, s) => bell(t, 0.08, 0.96) * clamp((c + 0.35) / 1.1, 0, 1);
    const hams = (t, c) => bell(t, 0.1, 0.86) * clamp(-c * 1.2, 0, 1);
    const erect = (t, c, s) => bell(t, 0.06, 0.7) * Math.pow(clamp(-c, 0, 1), 6);

    const thighG = segGeom(SH.thigh, { quads, hams });
    const shankG = segGeom(SH.shank);
    const torsoG = segGeom(fem ? SH.torso_f : SH.torso_m, { erectors: erect }, 40, 32, 0.05);
    const uarmG = segGeom(SH.uarm), farmG = segGeom(SH.farm), neckG = segGeom(SH.neck, {}, 20, 6, 0.02);
    f.paint.push(thighG, torsoG);

    const mk = (geo) => add(mesh(geo, skinMat()));
    f.thigh = [mk(thighG), mk(thighG)];
    f.shank = [mk(shankG), mk(shankG)];
    f.uarm = [mk(uarmG), mk(uarmG)];
    f.farm = [mk(farmG), mk(farmG)];
    f.torso = mk(torsoG);
    f.neck = mk(neckG);

    const sph = new THREE.SphereGeometry(1, 32, 20);
    const skinFlat = flatMat(SKIN);
    const joint = () => add(mesh(sph, skinFlat));
    f.knee = [joint(), joint()];
    f.ankle = [joint(), joint()];
    f.elbow = [joint(), joint()];
    f.hand = [add(mesh(sph, flatMat(SKIN2))), add(mesh(sph, flatMat(SKIN2)))];
    f.delt = [add(mesh(sph, flatMat(SKIN2))), add(mesh(sph, flatMat(SKIN2)))];

    // glúteo mayor: elipsoide aplanado, con material propio para la activación
    f.gluteMat = flatMat(SKIN.clone());
    f.glute = [add(mesh(gluteGeom(1), f.gluteMat)), add(mesh(gluteGeom(-1), f.gluteMat))];
    // pelvis: une el tronco con los muslos sin costuras
    f.pelvis = add(mesh(sph, skinFlat));

    // pies / zapatillas
    const shoeG = new THREE.BoxGeometry(1, 1, 1);
    shoeG.translate(0.5, 0.5, 0);
    const shoeMat = flatMat(0x2b3544, { roughness: 0.8 });
    f.foot = [add(mesh(shoeG, shoeMat)), add(mesh(shoeG, shoeMat))];

    // cabeza
    f.head = add(mesh(sph, skinFlat));
    const hairMat = flatMat(0x3a2e2a, { roughness: 0.9 });
    f.hair = add(mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.58), hairMat));
    if (fem) f.pony = add(mesh(sph, hairMat));
    f.nose = add(mesh(new THREE.ConeGeometry(1, 1, 12), skinFlat));

    // barra y discos
    const barMat = flatMat(0xdfe5ec, { metalness: 0.7, roughness: 0.3 });
    f.bar = add(mesh(new THREE.CylinderGeometry(1.4, 1.4, 220, 16), barMat));
    const plateG = new THREE.CylinderGeometry(22.5, 22.5, 5.5, 40);
    const plateMat = flatMat(0x46526a, { roughness: 0.5, metalness: 0.2, transparent: true, opacity: 0.55, depthWrite: false });
    f.plates = [add(mesh(plateG, plateMat, false)), add(mesh(plateG, plateMat, false))];

    scene.add(root);
    fig = f;
    figSex = sex;
  }

  // coloca una malla-segmento entre p0 y p1 (eje local +Y), escalada con la altura
  const UP = V3(0, 1, 0);
  function place(m, p0, p1, Hh, k = 1) {
    const d = p1.clone().sub(p0);
    const L = d.length();
    m.position.copy(p0);
    m.quaternion.setFromUnitVectors(UP, d.divideScalar(L || 1));
    m.scale.set(Hh * k, L, Hh * k);
  }

  // elipsoide con su eje Y local alineado a dir (vector 3D)
  function orient(m, c, dir, rx, ry, rz) {
    m.position.copy(c);
    m.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
    m.scale.set(rx, ry, rz);
  }

  function ball(m, c, r) { m.position.copy(c); m.quaternion.identity(); m.scale.set(r, r, r); }

  // elipsoide orientado: eje X local → dir (en el plano sagital)
  function ellip(m, c, dir, rx, ry, rz) {
    m.position.copy(c);
    m.quaternion.setFromAxisAngle(V3(0, 0, 1), Math.atan2(dir.y, dir.x));
    m.scale.set(rx, ry, rz);
  }

  // IK de dos segmentos: devuelve el codo dado hombro, muñeca y un polo
  function ik2(S, W, l1, l2, pole) {
    const d = W.clone().sub(S);
    const D = clamp(d.length(), 1e-3, (l1 + l2) * 0.999);
    const u = d.clone().normalize();
    const a = (l1 * l1 - l2 * l2 + D * D) / (2 * D);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const pp = pole.clone().sub(u.clone().multiplyScalar(pole.dot(u))).normalize();
    return S.clone().add(u.multiplyScalar(a)).add(pp.multiplyScalar(h));
  }

  function update(sc) {
    const { P, sex, mus, ex } = sc;
    if (!fig || figSex !== sex) buildFigure(sex);
    const f = fig;
    const Hh = P.height;
    const fem = sex === 'female';
    const squat = ex === 'squat';

    // anchuras (cm)
    const hipZ = 0.05 * Hh * (fem ? 1.05 : 1);
    const footZ = squat ? 0.1 * Hh : 0.06 * Hh;
    const toeOut = squat ? 16 * DEG : 6 * DEG;
    const shZ = (fem ? 0.098 : 0.11) * Hh;
    const gripZ = squat ? 0.24 * Hh : 0.13 * Hh;

    for (let i = 0; i < 2; i++) {
      const sg = i ? -1 : 1;
      const A = P3(P.A, sg * footZ);
      const H = P3(P.H, sg * hipZ);
      const tK = (P.K.y - P.A.y) / Math.max(1, P.H.y - P.A.y);
      // la rodilla sigue la dirección de la punta del pie: lo que avanza respecto a la
      // línea tobillo-cadera se desplaza hacia fuera con el mismo ángulo que el pie (sin valgo)
      const fwd = P.K.x - lerp(P.A.x, P.H.x, tK);
      const K = P3(P.K, sg * (lerp(footZ, hipZ, tK) + Math.max(0, fwd) * Math.tan(toeOut)));
      place(f.shank[i], A, K, Hh * (fem ? 0.95 : 1));
      place(f.thigh[i], K, H, Hh * (fem ? 1.04 : 1));
      ball(f.knee[i], K, 0.027 * Hh);
      ball(f.ankle[i], A, 0.018 * Hh);
      // pie girado hacia fuera
      const fl = P.toe.x - P.heel.x;
      const ft = f.foot[i];
      ft.position.set(P.heel.x * Math.cos(toeOut), 0, sg * footZ + sg * P.heel.x * Math.sin(toeOut));
      ft.rotation.set(0, -sg * toeOut, 0);
      ft.scale.set(fl, P.A.y + 0.012 * Hh, 0.056 * Hh);
    }

    // torso
    const td = V3(P.td.x, P.td.y, 0), n = V3(P.n.x, P.n.y, 0);
    const T0 = P3(P.H).add(td.clone().multiplyScalar(-0.04 * Hh));
    const T1 = P3(P.S).add(td.clone().multiplyScalar(0.035 * Hh));
    place(f.torso, T0, T1, Hh);

    // glúteos: entre la dirección posterior de la pelvis y la del muslo
    const dT = { x: P.H.x - P.K.x, y: P.H.y - P.K.y };
    const dl = Math.hypot(dT.x, dT.y) || 1; dT.x /= dl; dT.y /= dl;
    const nT = { x: dT.y, y: -dT.x };
    let bx = -P.n.x - nT.x - 0.3 * dT.x, by = -P.n.y - nT.y - 0.3 * dT.y;
    const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl;
    const gk = fem ? 1.1 : 1;
    // pelvis orientada con el tronco
    ellip(f.pelvis, P3(P.H).add(td.clone().multiplyScalar(0.01 * Hh)), { x: P.n.x, y: P.n.y },
      0.04 * Hh, 0.046 * Hh, (fem ? 0.098 : 0.092) * Hh);
    // glúteo mayor: más ancho que profundo, apoyado sobre la pelvis
    for (let i = 0; i < 2; i++) {
      const sg = i ? -1 : 1;
      const c = V3(P.H.x + bx * 0.026 * Hh * gk, P.H.y + by * 0.026 * Hh * gk, sg * 0.037 * Hh * gk);
      ellip(f.glute[i], c, { x: bx, y: by }, 0.043 * Hh * gk, 0.058 * Hh * gk, 0.05 * Hh * gk);
    }
    const gc = mcol(mus.glutes);
    f.gluteMat.color.copy(SKIN).lerp(gc.c, gc.a);

    // brazos
    const lat = V3(0, 0, 0);
    for (let i = 0; i < 2; i++) {
      const sg = i ? -1 : 1;
      const S = P3(P.S, sg * shZ).add(td.clone().multiplyScalar(-0.012 * Hh));
      const W = P3(P.W, sg * gripZ);
      const pole = squat ? n.clone().multiplyScalar(-1).add(td.clone().multiplyScalar(-1)).add(lat.set(0, 0, sg * 0.4))
                         : n.clone().multiplyScalar(-1).add(lat.set(0, 0, sg * 0.2));
      const E = ik2(S, W, 0.186 * Hh, 0.146 * Hh, pole);
      place(f.uarm[i], E, S, Hh * (fem ? 0.93 : 1));
      place(f.farm[i], W, E, Hh * (fem ? 0.93 : 1));
      ball(f.elbow[i], E, 0.021 * Hh);
      ball(f.hand[i], W.clone().add(W.clone().sub(E).normalize().multiplyScalar(0.025 * Hh)), 0.024 * Hh);
      const dk = fem ? 0.88 : 1;
      orient(f.delt[i], S.clone().lerp(E, 0.14), E.clone().sub(S), 0.036 * Hh * dk, 0.056 * Hh * dk, 0.036 * Hh * dk);
    }

    // cuello y cabeza
    const nd = V3(P.nd.x, P.nd.y, 0), nf = V3(P.nd.y, -P.nd.x, 0);
    const hc = P3(P.headC), r = P.headR;
    place(f.neck, P3(P.neck), hc, Hh * (fem ? 0.93 : 1));
    f.head.position.copy(hc);
    f.head.quaternion.setFromUnitVectors(UP, nd);
    f.head.scale.set(r * 1.0, r * 1.08, r * 0.86);
    f.hair.position.copy(hc);
    f.hair.quaternion.setFromUnitVectors(UP, nd.clone().multiplyScalar(0.8).add(nf.clone().multiplyScalar(-0.6)).normalize());
    f.hair.scale.set(r * 1.08, r * 1.14, r * 0.95);
    if (f.pony) {
      f.pony.position.copy(hc.clone().add(nf.clone().multiplyScalar(-1.12 * r)).add(nd.clone().multiplyScalar(-0.2 * r)));
      f.pony.quaternion.setFromUnitVectors(UP, nd);
      f.pony.scale.set(r * 0.3, r * 0.75, r * 0.3);
    }
    f.nose.position.copy(hc.clone().add(nf.clone().multiplyScalar(0.98 * r)).add(nd.clone().multiplyScalar(-0.08 * r)));
    f.nose.quaternion.setFromUnitVectors(UP, nf);
    f.nose.scale.set(0.12 * r, 0.3 * r, 0.12 * r);

    // barra
    f.bar.position.set(P.bar.x, P.bar.y, 0);
    f.bar.rotation.set(Math.PI / 2, 0, 0);
    f.plates.forEach((pl, i) => {
      pl.position.set(P.bar.x, P.bar.y, (i ? -1 : 1) * 74);
      pl.rotation.set(Math.PI / 2, 0, 0);
    });

    // activación muscular sobre los segmentos
    f.paint.forEach((g) => paint(g, mus));

    // mediopié y centro de masas
    const mid = scene.userData.mid;
    mid.position.set(P.midX, 0, 0);
    mid.scale.set(1, Hh * 1.08, 1);
    mid.material.color.set(P.ok ? 0xffd166 : 0xff5470);
    scene.userData.com.position.set(mus.com.x, mus.com.y, 0);

    target.set(lerp(target.x, P.midX, 0.2), lerp(target.y, Hh * 0.48, 0.2), 0);
  }

  /* ---------- cámara ---------- */
  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }

  function placeCamera(Hh) {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    cam.yaw += joy.x * 110 * DEG * dt;
    cam.pitch = clamp(cam.pitch - joy.y * 70 * DEG * dt, -8 * DEG, 80 * DEG);
    const fov = camera.fov * DEG;
    const D = (Hh * 1.25) / (2 * Math.tan(fov / 2)) / Math.min(1, camera.aspect * 1.1) * cam.zoom;
    camera.position.set(
      target.x + D * Math.sin(cam.yaw) * Math.cos(cam.pitch),
      target.y + D * Math.sin(cam.pitch),
      target.z + D * Math.cos(cam.yaw) * Math.cos(cam.pitch),
    );
    camera.lookAt(target);
  }

  function draw(sc) {
    update(sc);
    placeCamera(sc.P.height);
    renderer.render(scene, camera);
  }

  const VIEWS = { side: [0, 8], front: [90, 8], back: [-90, 10], q34: [38, 12], top: [30, 62] };
  function setView(name) {
    const v = VIEWS[name];
    if (!v) return;
    cam.yaw = v[0] * DEG; cam.pitch = v[1] * DEG;
  }
  function zoomBy(k) { cam.zoom = clamp(cam.zoom * k, 0.45, 2.2); }
  function setJoy(x, y) { joy.x = x; joy.y = y; }

  // arrastre con ratón/dedo y rueda sobre el lienzo
  function bindPointer() {
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      cam.yaw -= (e.clientX - drag.x) * 0.4 * DEG;
      cam.pitch = clamp(cam.pitch + (e.clientY - drag.y) * 0.3 * DEG, -8 * DEG, 80 * DEG);
      drag = { x: e.clientX, y: e.clientY };
    });
    const end = () => { drag = null; canvas.style.cursor = 'grab'; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(e.deltaY > 0 ? 1.08 : 1 / 1.08); }, { passive: false });
    canvas.style.cursor = 'grab';
  }

  return { available: true, init, resize, draw, setView, zoomBy, setJoy };
})();
