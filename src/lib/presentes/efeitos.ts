/**
 * Animações dos presentes das lives (como no TikTok): faixas com combo, cenas 3D e
 * efeitos presos ao rosto de quem está em directo.
 *
 * Este módulo é pesado (three.js), por isso só é carregado quando alguém entra numa live
 * (`import()` em `views/lives.ts`). Os modelos 3D e o reconhecimento de rosto só são
 * descarregados quando chega um presente que precisa deles.
 *
 * Quem está a ver nunca vê o valor do presente: só o nome e quem o enviou.
 *
 * Modelos (licença CC-BY, créditos obrigatórios — estão também na gaveta dos presentes):
 *   • Leão: «Lion», de doizy (Sketchfab)
 *   • Garrafa: «Bottle of Champagne», de Sirolalo (Sketchfab, CC-BY 4.0)
 * Rosto: Google MediaPipe Face Landmarker (Apache 2.0), alojado em /lives/.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export type Presente = { key: string; name: string; icon: string };
export type Efeitos = { mostrar(p: Presente, quem: string, avatar?: string | null): void; coracao(): void; parar(): void };

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const eOut = (x: number) => 1 - Math.pow(1 - x, 3);
const eIn = (x: number) => x * x * x;
const eInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const eBack = (x: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const sph = (r: number) => new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(r);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const V2 = (x: number, y: number) => new THREE.Vector2(x, y);

type Cena = { dur: number; start?: number; update(t: number, dt: number): void; end?(): void };
type Rosto = { top: { x: number; y: number }; cheek: { x: number; y: number }; fw: number; up: { x: number; y: number }; roll: number; yaw: number };

/** Pontos de luz (partículas aditivas). */
class Parts {
  private a: Array<{ p: THREE.Vector3; v: THREE.Vector3; c: THREE.Color; l: number; L: number; grav: number; drag: number } | null> = [];
  private pos: Float32Array; private col: Float32Array; private g = new THREE.BufferGeometry(); private m: THREE.PointsMaterial;
  private pts: THREE.Points; private k = 0; private s: THREE.Scene; private n: number;
  constructor(s: THREE.Scene, n: number, size: number, spr: THREE.Texture, ortho = false) {
    this.s = s; this.n = n;
    this.pos = new Float32Array(n * 3).fill(-9999); this.col = new Float32Array(n * 3);
    this.g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); this.g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.m = new THREE.PointsMaterial({ size, map: spr, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: !ortho });
    this.pts = new THREE.Points(this.g, this.m); this.pts.frustumCulled = false; this.pts.renderOrder = 5; s.add(this.pts);
  }
  emit(p: THREE.Vector3, v: THREE.Vector3, c: number, life: number, grav = 0, drag = 0) { this.a[this.k++ % this.n] = { p: p.clone(), v: v.clone(), c: new THREE.Color(c), l: life, L: life, grav, drag }; }
  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      const q = this.a[i]; if (!q) continue; q.l -= dt;
      if (q.l <= 0) { this.a[i] = null; this.pos[i * 3 + 1] = -9999; continue; }
      q.v.y -= q.grav * dt; if (q.drag) q.v.multiplyScalar(1 - q.drag * dt); q.p.addScaledVector(q.v, dt);
      this.pos[i * 3] = q.p.x; this.pos[i * 3 + 1] = q.p.y; this.pos[i * 3 + 2] = q.p.z;
      const f = Math.min(1, (q.l / q.L) * 1.6); this.col[i * 3] = q.c.r * f; this.col[i * 3 + 1] = q.c.g * f; this.col[i * 3 + 2] = q.c.b * f;
    }
    this.g.attributes.position.needsUpdate = true; this.g.attributes.color.needsUpdate = true;
  }
  dispose() { this.s.remove(this.pts); this.g.dispose(); this.m.dispose(); }
}

const LIPS = `<svg viewBox="0 0 100 62"><defs><radialGradient id="pzlg" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#ff2a55"/><stop offset="1" stop-color="#a1001f"/></radialGradient></defs>
<path d="M4 31 C18 6,38 4,50 18 C62 4,82 6,96 31 C76 35,24 35,4 31Z" fill="url(#pzlg)"/><path d="M4 31 C24 37,76 37,96 31 C82 60,18 60,4 31Z" fill="url(#pzlg)"/>
<path d="M10 31 Q50 39 90 31" stroke="#6d0016" stroke-width="2.2" fill="none" opacity=".7"/></svg>`;

/**
 * Prepara as animações dentro do palco da live.
 * `video()` devolve o elemento de vídeo de quem está em directo (para o rosto).
 */
export function iniciar(palco: HTMLElement, video: () => HTMLVideoElement | null): Efeitos {
  const W = () => palco.clientWidth, H = () => palco.clientHeight;
  const canvas = document.createElement('canvas'); canvas.className = 'pz-gl'; palco.appendChild(canvas);
  const lanes = document.createElement('div'); lanes.className = 'pz-lanes'; palco.appendChild(lanes);
  const el = (cls: string, html = '', parent: HTMLElement = palco, style: Partial<CSSStyleDeclaration> = {}) => {
    const e = document.createElement('div'); e.className = cls; if (html) e.innerHTML = html; Object.assign(e.style, style); parent.appendChild(e); return e;
  };

  /* ---------- 3D ---------- */
  const R = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  R.setPixelRatio(Math.min(devicePixelRatio, 2)); R.localClippingEnabled = true;
  R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.1; R.autoClear = false;
  const pmrem = new THREE.PMREMGenerator(R);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const gemEnv = (() => {
    const s = new THREE.Scene(); s.background = new THREE.Color(0x2a2a3a);
    const cols = [0xffffff, 0xffffff, 0x9fd8ff, 0xffb3e6, 0xfff1a8, 0xffffff, 0xa8ffe0, 0xffffff];
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(rnd(0.8, 2), rnd(0.8, 2.6)), new THREE.MeshBasicMaterial({ color: new THREE.Color(cols[i % cols.length]).multiplyScalar(rnd(2, 6)), side: THREE.DoubleSide }));
      m.position.copy(sph(5)); m.lookAt(0, 0, 0); s.add(m);
    }
    return pmrem.fromScene(s, 0).texture;
  })();
  const luzes = (s: THREE.Scene, pos: THREE.Vector3) => {
    s.environment = env; s.add(new THREE.AmbientLight(0xffffff, 0.5));
    const d = new THREE.DirectionalLight(0xfff2dd, 2.4); d.position.copy(pos); s.add(d);
    const d2 = new THREE.DirectionalLight(0xbfd8ff, 1); d2.position.set(-pos.x, pos.y * 0.3, pos.z); s.add(d2);
  };
  const S3 = new THREE.Scene(); luzes(S3, new THREE.Vector3(3, 5, 6));
  const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 200); cam.position.set(0, 0, 12);
  const SF = new THREE.Scene(); luzes(SF, new THREE.Vector3(200, 300, 900));
  const ocam = new THREE.OrthographicCamera(0, 1, 0, -1, -3000, 3000);
  let w = 0, h = 0;
  const ajusta = () => {
    if (W() === w && H() === h) return; w = W(); h = H();
    R.setSize(w, h, false); cam.aspect = w / h;
    /* em ecrãs largos (computador) afasta a câmara para os objectos não ficarem enormes */
    cam.position.z = w / h > 0.75 ? 12 * Math.min(1.6, (w / h) / 0.75) * 0.75 : 12;
    cam.updateProjectionMatrix(); ocam.right = w; ocam.bottom = -h; ocam.updateProjectionMatrix();
  };

  const spr = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.8)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  })();

  const M = {
    gold: new THREE.MeshStandardMaterial({ color: 0xffc53d, metalness: 1, roughness: 0.18 }),
    goldDark: new THREE.MeshStandardMaterial({ color: 0xc98a12, metalness: 1, roughness: 0.3 }),
    cork: new THREE.MeshStandardMaterial({ color: 0xcfa26a, roughness: 0.8 }),
    velvet: new THREE.MeshStandardMaterial({ color: 0x8a0d2b, roughness: 0.95 }),
    velvetIn: new THREE.MeshStandardMaterial({ color: 0x5c0619, roughness: 1 }),
    gem: new THREE.MeshPhysicalMaterial({ color: 0xeaf7ff, metalness: 1, roughness: 0, envMap: gemEnv, envMapIntensity: 1.6, iridescence: 0.8, iridescenceIOR: 2.2, flatShading: true }),
    ruby: new THREE.MeshPhysicalMaterial({ color: 0xff1745, metalness: 1, roughness: 0, envMap: gemEnv, envMapIntensity: 1.4, flatShading: true }),
    sapph: new THREE.MeshPhysicalMaterial({ color: 0x2f6bff, metalness: 1, roughness: 0, envMap: gemEnv, envMapIntensity: 1.4, flatShading: true }),
    pearl: new THREE.MeshPhysicalMaterial({ color: 0xfff8ee, roughness: 0.25, sheen: 1, clearcoat: 1 }),
  };
  const brilliant = (n = 8) => new THREE.LatheGeometry([V2(0.001, -0.85), V2(1, 0), V2(1, 0.08), V2(0.58, 0.42), V2(0.001, 0.42)], n);
  const dispose = (o: THREE.Object3D) => { o.traverse((c) => { const m = c as THREE.Mesh; if (m.geometry) m.geometry.dispose(); }); o.parent?.remove(o); };

  /* ciclo: só desenha enquanto houver cenas */
  const active = new Set<Cena>(); let last = performance.now(), drawn = false, raf = 0, vivo = true;
  const play = (a: Cena) => { a.start = performance.now(); active.add(a); };
  const loop = (now: number) => {
    if (!vivo) return; raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (rostoLigado) seguirRosto(now);
    if (!active.size) { if (drawn) { R.clear(); drawn = false; } return; }
    ajusta();
    for (const a of [...active]) { const t = (now - a.start!) / 1000; if (t >= a.dur) { a.end?.(); active.delete(a); continue; } a.update(t, dt); }
    R.clear(); R.render(S3, cam); R.clearDepth(); R.render(SF, ocam); drawn = true;
  };
  raf = requestAnimationFrame(loop);

  /* ---------- modelos (carregados a pedido, uma só vez) ---------- */
  const loader = new GLTFLoader();
  const cache: Record<string, Promise<GLTF>> = {};
  const modelo = (url: string) => (cache[url] ||= loader.loadAsync(url));
  const normaliza = (src: THREE.Object3D, altura: number) => {
    const m = src.clone(true); const box = new THREE.Box3().setFromObject(m), sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const k = altura / sz.y; m.scale.multiplyScalar(k); m.position.sub(c.multiplyScalar(k)); const g = new THREE.Group(); g.add(m); return g;
  };

  /* ---------- rosto (MediaPipe), só ligado quando chega um beijo ou uma coroa ---------- */
  let rostoLigado = false, fl: any = null, rosto: Rosto | null = null, visto = 0, lastVT = -1;
  const ligarRosto = async () => {
    if (rostoLigado) return; rostoLigado = true;
    try {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const fs = await FilesetResolver.forVisionTasks('/lives/wasm');
      const op = (delegate: 'GPU' | 'CPU') => FaceLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: '/lives/modelos/rosto.task', delegate }, runningMode: 'VIDEO', numFaces: 1 });
      fl = await op('GPU').catch(() => op('CPU'));
    } catch (e) { console.warn('rosto', e); }
  };
  const seguirRosto = (now: number) => {
    const v = video(); if (!fl || !v || v.readyState < 2 || v.currentTime === lastVT) return; lastVT = v.currentTime;
    let r: any; try { r = fl.detectForVideo(v, now); } catch { return; }
    const lm = r?.faceLandmarks?.[0];
    if (!lm) { if (now - visto > 600) rosto = null; return; }
    /* converte do vídeo para o ecrã (o vídeo pode estar em «cover» ou «contain») */
    const vb = v.getBoundingClientRect(), pb = palco.getBoundingClientRect(), vw = v.videoWidth, vh = v.videoHeight;
    const fit = getComputedStyle(v).objectFit === 'cover' ? Math.max(vb.width / vw, vb.height / vh) : Math.min(vb.width / vw, vb.height / vh);
    const ox = vb.left - pb.left + (vb.width - vw * fit) / 2, oy = vb.top - pb.top + (vb.height - vh * fit) / 2;
    const P = (i: number) => ({ x: ox + lm[i].x * vw * fit, y: oy + lm[i].y * vh * fit });
    const top = P(10), L = P(234), Rr = P(454), nose = P(1), cheek = P(425), e1 = P(33), e2 = P(263);
    const fw = Math.hypot(Rr.x - L.x, Rr.y - L.y), ux = e2.y - e1.y, uy = -(e2.x - e1.x), ul = Math.hypot(ux, uy) || 1;
    const mid = { x: (L.x + Rr.x) / 2 };
    rosto = { top, cheek, fw, up: { x: ux / ul, y: uy / ul }, roll: -Math.atan2(ux / ul, -uy / ul), yaw: clamp((nose.x - mid.x) / (fw / 2), -1, 1) * 0.9 };
    visto = now;
  };
  const rostoOu = (): Rosto => rosto || { top: { x: w / 2, y: h * 0.25 }, cheek: { x: w * 0.6, y: h * 0.38 }, fw: Math.min(w, h) * 0.4, up: { x: 0, y: -1 }, roll: 0, yaw: 0 };

  /* ---------- 2D: faixas com combo, véus, legendas, faixa dourada ---------- */
  const strips: Record<string, { el: HTMLElement; n: number; lane: number; at: number; t: number }> = {};
  const av = (quem: string, avatar?: string | null) => avatar ? `<img class="pz-av" src="${esc(avatar)}" alt="">` : `<span class="pz-av">${esc((quem[0] || '?').toUpperCase())}</span>`;
  const drop = (k: string, ja = false) => { const s = strips[k]; if (!s) return; clearTimeout(s.t); delete strips[k]; s.el.classList.add('out'); setTimeout(() => s.el.remove(), ja ? 0 : 300); };
  const strip = (p: Presente, quem: string, avatar?: string | null) => {
    const k = quem + '|' + p.key, s = strips[k];
    if (s) {
      s.n++; const x = s.el.querySelector('.x') as HTMLElement; x.innerHTML = '<small>x</small>' + s.n;
      x.className = 'x'; void x.offsetWidth; x.classList.add(s.n % 10 === 0 ? 'mil' : 'bump');
      clearTimeout(s.t); s.t = window.setTimeout(() => drop(k), 3000); return;
    }
    const used = Object.values(strips).map((v) => v.lane); let lane = [0, 1].find((i) => !used.includes(i));
    if (lane === undefined) { const old = Object.entries(strips).sort((a, b) => a[1].at - b[1].at)[0]; lane = old[1].lane; drop(old[0], true); }
    const e = el('pz-strip l' + lane, `${av(quem, avatar)}<div class="t"><b>${esc(quem)}</b><span>enviou ${esc(p.name)}</span></div><span class="gi">${p.icon}</span><span class="x"><small>x</small>1</span>`, lanes);
    strips[k] = { el: e, n: 1, lane, at: Date.now(), t: window.setTimeout(() => drop(k), 3000) };
  };
  const fx = (T: number) => { const f = el('pz-fx'); f.style.setProperty('--T', T + 'ms'); setTimeout(() => f.remove(), T + 150); return f; };
  const banner = (quem: string, p: Presente, T: number, baixo = false, avatar?: string | null) => {
    const b = el('pz-hdr', `${av(quem, avatar)}<b>${esc(quem)}</b><span>enviou ${esc(p.name)} ${p.icon}</span>`); if (baixo) b.style.top = '54%';
    setTimeout(() => b.classList.add('out'), T - 400); setTimeout(() => b.remove(), T);
  };
  const legenda = (f: HTMLElement, quem: string, p: Presente) => el('pz-lbl', `<b>${esc(p.name)}</b><span>${esc(quem)}</span>`, f);
  const treme = () => { palco.classList.remove('pz-shake'); void palco.offsetWidth; palco.classList.add('pz-shake'); };
  const burst2 = (x: number, y: number, chars: string[], n: number, dist: number) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = dist * rnd(0.5, 1.2);
      const p = el('pz-p2', chars[i % chars.length], palco, { left: x + 'px', top: y + 'px', fontSize: rnd(12, 22) + 'px' });
      p.style.setProperty('--dx', Math.cos(a) * r + 'px'); p.style.setProperty('--dy', Math.sin(a) * r + 'px'); setTimeout(() => p.remove(), 1500);
    }
  };

  /* ---------- cenas ---------- */
  const beijo = () => {
    void ligarRosto(); ajusta();
    const k = el('pz-kiss', LIPS); const T = 3.6; let marcado = false;
    play({ dur: T, update(t) {
      const f = rostoOu(), tx = f.cheek.x, ty = f.cheek.y, size = f.fw * 0.34, a = eOut(seg(t, 0, 0.55));
      const x = lerp(w * 0.5, tx, a), y = lerp(h + 60, ty, a); let sc = lerp(3.2, 1, a), op = 1;
      if (t > 0.55 && !marcado) { marcado = true; k.style.mixBlendMode = 'multiply'; burst2(tx, ty, ['💗', '💕', '✨', '💖'], 12, 70); }
      if (t > 0.55) sc = 1 + 0.25 * Math.max(0, 1 - (t - 0.55) / 0.15) * Math.sin((t - 0.55) * 40);
      if (t > T - 0.6) op = 1 - (t - (T - 0.6)) / 0.6;
      k.style.width = size + 'px'; k.style.height = size * 0.62 + 'px'; k.style.opacity = String(marcado ? op * 0.88 : 1);
      k.style.transform = `translate(${x - size / 2}px,${y - size * 0.31}px) rotate(${(f.roll * 180) / Math.PI - 12}deg) scale(${sc})`;
    }, end() { k.remove(); } });
    return 0;
  };

  const coroaModelo = () => {
    const c = new THREE.Group();
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.02, 0.42, 64, 1, true), M.gold); band.position.y = 0.21; c.add(band);
    const rimB = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.05, 12, 64), M.goldDark); rimB.rotation.x = Math.PI / 2; c.add(rimB);
    const rimT = rimB.clone(); rimT.position.y = 0.42; c.add(rimT);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.96, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.velvet); cap.scale.y = 0.75; cap.position.y = 0.3; c.add(cap);
    const N = 8;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.62, 4), M.gold); sp.position.set(Math.cos(a), 0.73, Math.sin(a)); sp.rotation.y = -a; c.add(sp);
      const pe = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), M.pearl); pe.position.set(Math.cos(a), 1.08, Math.sin(a)); c.add(pe);
      const gm = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), i % 2 ? M.sapph : M.ruby);
      gm.position.set(Math.cos(a + Math.PI / N) * 1.03, 0.21, Math.sin(a + Math.PI / N) * 1.03); gm.scale.set(1, 1.3, 0.6); gm.lookAt(gm.position.clone().multiplyScalar(3)); c.add(gm);
    }
    const cross = new THREE.Group();
    cross.add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.34, 0.09), M.gold));
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.09, 0.09), M.gold); c2.position.y = 0.06; cross.add(c2);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), M.gold); orb.position.y = -0.2; cross.add(orb);
    cross.position.y = 1.02; c.add(cross); return c;
  };
  const coroa = (quem: string, p: Presente, avatar?: string | null) => {
    void ligarRosto(); ajusta();
    const T = 6; const f2 = fx(T * 1000); el('pz-veil soft', '', f2); banner(quem, p, T * 1000, true, avatar);
    const crown = coroaModelo(); crown.rotation.order = 'ZXY'; SF.add(crown); const sp = new Parts(SF, 260, 9, spr, true); let pousou = false;
    play({ dur: T, update(t, dt) {
      const f = rostoOu(), s = f.fw * 0.46;
      const px = f.up.x * 0.5, py = (f.up.y - 1) / 2, pl = Math.hypot(px, py) || 1;
      /* o ponto 10 é o meio da testa: sobe até ao alto da cabeça; quando a cara roda, o alto da cabeça fica do lado oposto ao nariz */
      const ax = f.top.x + (px / pl) * f.fw * 0.2 - f.yaw * f.fw * 0.35, ay = f.top.y + (py / pl) * f.fw * 0.2;
      const a = seg(t, 0, 1.1);
      crown.position.set(ax, -lerp(ay - h * 0.55, ay, eBack(a)), 0);
      crown.scale.setScalar(Math.max(0.001, s * (1 - eIn(seg(t, T - 0.7, T)))));
      crown.rotation.set(0.32, f.yaw + (1 - eOut(a)) * Math.PI * 4 + Math.sin(t * 1.5) * 0.06, f.roll * 0.6);
      if (a >= 1 && !pousou) {
        pousou = true;
        for (let i = 0; i < 70; i++) { const d = sph(1); sp.emit(new THREE.Vector3(ax, -ay, 200), new THREE.Vector3(d.x * rnd(150, 420), Math.abs(d.y) * rnd(120, 400), 0), i % 3 ? 0xffd76a : 0xffffff, rnd(0.5, 1.1), 500, 1.5); }
      }
      if (pousou && Math.random() < 0.5) { const q = sph(s * 1.1); sp.emit(new THREE.Vector3(ax + q.x, -ay + Math.abs(q.y) * 0.8 + s * 0.4, 200), new THREE.Vector3(0, rnd(10, 40), 0), 0xfff1b8, rnd(0.3, 0.7)); }
      sp.update(dt);
    }, end() { dispose(crown); sp.dispose(); } });
    return T * 1000;
  };

  const gota = () => { const d = el('pz-drop', '', palco, { left: rnd(5, 92) + '%', top: rnd(8, 70) + '%', width: rnd(10, 26) + 'px' }); d.style.height = d.style.width; setTimeout(() => d.remove(), 2600); };
  const champanhe = async (quem: string, p: Presente) => {
    const gl = await modelo('/lives/modelos/garrafa/scene.gltf');
    const T = 7; const f2 = fx(T * 1000); el('pz-veil dim', '', f2); legenda(f2, quem, p); ajusta();
    const root = new THREE.Group(); S3.add(root);
    const HB = 2.7, b = normaliza(gl.scene, HB); root.add(b);
    /* o modelo tem a rolha agarrada ao gargalo: corta-se no momento em que salta */
    const corte = new THREE.Plane(new THREE.Vector3(0, -1, 0), 9999);
    b.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { const mat = (m.material as THREE.MeshStandardMaterial).clone(); mat.clippingPlanes = [corte]; mat.envMapIntensity = 1.6; m.material = mat; } });
    const cork = new THREE.Group(); cork.add(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.068, 0.2, 24), M.cork));
    const ct = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.cork); ct.position.y = 0.08; ct.scale.y = 0.7; cork.add(ct); cork.visible = false; root.add(cork);
    const P = new Parts(S3, 4000, 0.2, spr), B = new Parts(S3, 900, 0.42, spr); let saltou = false; const cv = new THREE.Vector3();
    const boca = () => { b.updateMatrixWorld(); return b.localToWorld(new THREE.Vector3(0, (HB / 2) * 0.985, 0)); };
    const eixo = () => new THREE.Vector3(0, 1, 0).applyQuaternion(b.quaternion).normalize();
    const COR = [0xfff6dc, 0xffe9a8, 0xffd970, 0xffffff];
    play({ dur: T, update(t, dt) {
      const a = eBack(seg(t, 0, 0.9)); let bx = 0, by = lerp(-7, -0.9, a), rz = -0.08; const ry = lerp(-1.2, 0.2, eOut(seg(t, 0, 1.2)));
      if (t > 0.9 && t < 2.1) { const k = seg(t, 0.9, 2.1); rz += Math.sin(t * 46) * 0.2 * (0.4 + k); bx += Math.sin(t * 31) * 0.06; by += Math.abs(Math.sin(t * 46)) * 0.07; }
      const sw = seg(t, 2.1, 5.6), calma = eInOut(seg(t, 5.6, 6.3));
      if (t >= 2.1) { rz = Math.sin((t - 2.1) * 3.2) * 0.95 * (1 - calma) - 0.08 * calma; by += Math.sin((t - 2.1) * 6.4) * 0.06 * (1 - calma); }
      b.position.set(bx, by, 0); b.rotation.set(0, ry, rz);
      if (t >= 2.1 && !saltou) {
        saltou = true; const m = boca(); cork.visible = true; cork.position.copy(m); cv.copy(eixo()).multiplyScalar(8).add(new THREE.Vector3(-1.2, 0, 1.5)); treme();
        for (let i = 0; i < 900; i++) { const d = eixo().add(sph(0.8)).normalize(); P.emit(m, d.multiplyScalar(rnd(3, 12)), COR[i % 4], rnd(1, 2), 5, 0.5); }
        for (let i = 0; i < 10; i++) setTimeout(gota, i * 90);
      }
      if (saltou) {
        cv.y -= 12 * dt; cork.position.addScaledVector(cv, dt); cork.rotation.x += 16 * dt; cork.rotation.z += 10 * dt;
        const m = boca(), n = eixo(); corte.setFromNormalAndCoplanarPoint(n.clone().negate(), m.clone().addScaledVector(n, -HB * 0.075));
        const forca = (1 - sw) * (1 - calma);
        for (let i = 0; i < Math.round(75 * forca); i++) { const d = n.clone().add(sph(0.38)).normalize(); P.emit(m.clone().add(sph(0.03)), d.multiplyScalar(rnd(5, 13) * (0.55 + forca * 0.45)), COR[i % 4], rnd(1.1, 2), 6, 0.25); }
        for (let i = 0; i < Math.round(12 * forca); i++) { const d = n.clone().add(sph(0.4)).normalize(); B.emit(m.clone(), d.multiplyScalar(rnd(3, 7)), 0xfff3c8, rnd(0.6, 1.2), 8, 0.3); }
        if (forca > 0.2 && Math.random() < 0.12 * forca) gota();
      }
      const out = eIn(seg(t, T - 0.6, T)); root.scale.setScalar(1 - out * 0.9); root.position.y = -out * 2;
      P.update(dt); B.update(dt);
    }, end() { dispose(root); P.dispose(); B.dispose(); } });
    return T * 1000;
  };

  const anel = (quem: string, p: Presente) => {
    const T = 5.6; const f2 = fx(T * 1000); el('pz-veil dim', '', f2); legenda(f2, quem, p); ajusta();
    const root = new THREE.Group(); S3.add(root); const box = new THREE.Group(); root.add(box);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.75, 1.5), M.velvet); base.position.y = -0.375; box.add(base);
    const cush = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 1.3), M.velvetIn); cush.position.y = -0.02; box.add(cush);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.05, 1.52), M.gold); trim.position.y = -0.02; box.add(trim);
    const hinge = new THREE.Group(); hinge.position.set(0, 0, -0.75); box.add(hinge);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.45, 1.5), M.velvet); lid.position.set(0, 0.225, 0.75); hinge.add(lid);
    const lidIn = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.02, 1.3), new THREE.MeshStandardMaterial({ color: 0xf3e3e8, roughness: 0.6 })); lidIn.position.set(0, 0.005, 0.75); hinge.add(lidIn);
    const ring = new THREE.Group(); ring.add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.065, 32, 96), M.gold));
    const set = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.06, 0.12, 8), M.gold); set.position.y = 0.5; ring.add(set);
    const dia = new THREE.Mesh(brilliant(16), M.gem); dia.scale.setScalar(0.2); dia.position.y = 0.62; ring.add(dia);
    ring.scale.setScalar(0.001); S3.add(ring);
    const P = new Parts(S3, 500, 0.1, spr);
    play({ dur: T, update(t, dt) {
      const a = eBack(seg(t, 0, 0.9)); root.position.set(0, lerp(-7, -0.2, a), 0);
      root.rotation.set(0.42, lerp(Math.PI * 2, 0, eOut(seg(t, 0, 1.1))) + Math.sin(t) * 0.08, 0);
      hinge.rotation.x = -1.95 * eBack(seg(t, 1.1, 1.7));
      if (t > 1.2 && t < 2.2) for (let i = 0; i < 4; i++) P.emit(new THREE.Vector3(rnd(-0.6, 0.6), root.position.y + 0.1, rnd(-0.4, 0.4)), new THREE.Vector3(rnd(-0.3, 0.3), rnd(1.5, 3), 0), i % 2 ? 0xffe7a3 : 0xffffff, rnd(0.6, 1.2), 0, 0.5);
      const up = eOut(seg(t, 1.5, 2.6)); ring.position.set(0, root.position.y + lerp(0.1, 1.75, up), lerp(0, 0.8, up));
      ring.scale.setScalar(Math.max(0.001, lerp(0.4, 1.35, up) * (t > 1.45 ? 1 : 0)));
      ring.rotation.set(-0.1, t * 2.6, Math.sin(t * 1.3) * 0.08); dia.rotation.y = t * 3;
      if (up > 0.9 && Math.random() < 0.7) { const d = new THREE.Vector3(); ring.updateMatrixWorld(); dia.getWorldPosition(d); P.emit(d.add(sph(rnd(0.05, 0.35))), new THREE.Vector3(0, 0.1, 0), [0xffffff, 0xbfe9ff, 0xffd6f0][Math.floor(Math.random() * 3)], rnd(0.2, 0.5)); }
      const out = eIn(seg(t, T - 0.7, T)); if (out > 0) { root.scale.setScalar(1 - out); ring.scale.multiplyScalar(1 + out * 1.2); ring.position.z += out * 4; }
      P.update(dt);
    }, end() { dispose(root); dispose(ring); P.dispose(); } });
    return T * 1000;
  };

  const diamante = (quem: string, p: Presente, avatar?: string | null) => {
    const T = 5.6; const f2 = fx(T * 1000); el('pz-veil space', '', f2); legenda(f2, quem, p); banner(quem, p, T * 1000, false, avatar); ajusta();
    const root = new THREE.Group(); S3.add(root); const d = new THREE.Mesh(brilliant(12), M.gem); root.add(d);
    const small: THREE.Mesh[] = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(brilliant(8), M.gem); m.scale.setScalar(rnd(0.1, 0.2)); m.position.set(rnd(-2, 2), rnd(4, 9), rnd(-2, 1));
      m.userData = { v: rnd(2, 4), w: new THREE.Vector3(rnd(-3, 3), rnd(-3, 3), rnd(-3, 3)) }; root.add(m); small.push(m);
    }
    const stars = new Parts(S3, 300, 0.06, spr); for (let i = 0; i < 300; i++) stars.emit(new THREE.Vector3(rnd(-4, 4), rnd(-5, 5), rnd(-6, -1)), new THREE.Vector3(), 0xffffff, rnd(3, T));
    const P = new Parts(S3, 500, 0.14, spr);
    play({ dur: T, update(t, dt) {
      const a = eBack(seg(t, 0, 1.1)); d.scale.setScalar(Math.max(0.001, 1.25 * a)); d.position.y = 0.3 + Math.sin(t * 1.6) * 0.08;
      d.rotation.set(0.35 + Math.sin(t * 0.9) * 0.15, t * (t < 1.2 ? 7 : 1.4) + 0.6, Math.sin(t * 0.7) * 0.1);
      if (t > 0.6 && Math.random() < 0.8) P.emit(sph(rnd(0.9, 1.5)).add(new THREE.Vector3(0, 0.3, 0)), new THREE.Vector3(), [0xffffff, 0x9fe0ff, 0xffb3e6, 0xfff3a0][Math.floor(Math.random() * 4)], rnd(0.2, 0.6));
      if (t > 1.05 && t < 1.15) for (let i = 0; i < 120; i++) P.emit(new THREE.Vector3(0, 0.3, 0), sph(rnd(2, 6)), i % 2 ? 0xbfe9ff : 0xffffff, rnd(0.5, 1), 0, 1.2);
      for (const m of small) { m.position.y -= m.userData.v * dt * (t > 1 ? 1 : 0); m.rotation.x += m.userData.w.x * dt; m.rotation.y += m.userData.w.y * dt; }
      const out = eIn(seg(t, T - 0.7, T)); if (out > 0) { d.scale.setScalar(1.25 * (1 + out * 2)); root.position.z = out * 6; }
      stars.update(dt); P.update(dt);
    }, end() { dispose(root); stars.dispose(); P.dispose(); } });
    return T * 1000;
  };

  const leao = async (quem: string, p: Presente, avatar?: string | null) => {
    const gl = await modelo('/lives/modelos/leao.glb');
    const T = 6.6; const f2 = fx(T * 1000); el('pz-veil gold', '', f2); el('pz-mane', '', f2); legenda(f2, quem, p); banner(quem, p, T * 1000, false, avatar); ajusta();
    const root = new THREE.Group(); S3.add(root);
    const m = SkeletonUtils.clone(gl.scene); const box = new THREE.Box3().setFromObject(m), sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const k = 2.6 / sz.y; m.scale.setScalar(k); m.position.set(-c.x * k, -box.min.y * k, -c.z * k);
    /* o modelo original olha para +X: assim, com o pivô a zero, fica a olhar para a câmara */
    const inner = new THREE.Group(); inner.add(m); inner.rotation.y = -Math.PI / 2; const pivot = new THREE.Group(); pivot.add(inner); root.add(pivot);
    m.traverse((o) => { o.frustumCulled = false; });
    const mix = new THREE.AnimationMixer(m); const act = gl.animations[0] ? mix.clipAction(gl.animations[0]) : null; act?.play();
    const P = new Parts(S3, 500, 0.12, spr); let rugiu = false;
    play({ dur: T, update(t, dt) {
      const walk = eOut(seg(t, 0, 2.4)), turn = eInOut(seg(t, 2.4, 3));
      pivot.position.set(lerp(4.2, 0, walk), -2.0, lerp(-1, 0.6, walk)); pivot.rotation.y = lerp(-Math.PI / 2, 0, turn);
      if (act) act.timeScale = t < 2.4 ? 1 : lerp(1, 0.35, seg(t, 2.4, 3));
      if (t < 2.4 && Math.random() < 0.5) P.emit(new THREE.Vector3(pivot.position.x + rnd(-0.5, 0.5), -1.95, pivot.position.z), new THREE.Vector3(rnd(-0.2, 0.6), rnd(0.2, 0.6), 0), 0xcaa46a, rnd(0.4, 0.8));
      if (t >= 3.1 && !rugiu) {
        rugiu = true; treme();
        [0, 180, 360].forEach((d) => setTimeout(() => el('pz-wave', '', f2, { left: '50%', top: '50%' }), d));
        for (let i = 0; i < 160; i++) P.emit(new THREE.Vector3(0, -0.6, 1), sph(rnd(2, 6)), i % 3 ? 0xffd56a : 0xffffff, rnd(0.6, 1.3), 0, 1.2);
      }
      const roar = Math.max(0, 1 - Math.abs(t - 3.25) / 0.35); pivot.scale.setScalar(1 + roar * 0.12); pivot.rotation.x = -roar * 0.12;
      const out = eIn(seg(t, T - 0.7, T)); if (out > 0) { pivot.scale.setScalar(1 + out * 1.5); root.position.z = out * 5; }
      mix.update(dt); P.update(dt);
    }, end() { dispose(root); P.dispose(); mix.stopAllAction(); } });
    return T * 1000;
  };

  const coracaoGrande = (p: Presente) => {
    const T = 2700, f = fx(T); el('pz-pulse', p.icon, f); burst2(w / 2 || W() / 2, (h || H()) * 0.42, ['❤️', '💖', '💗', '💕'], 22, 190); return T;
  };

  /* fila: as cenas grandes passam uma de cada vez; as faixas aparecem logo */
  const CENAS: Record<string, (q: string, p: Presente, a?: string | null) => number | Promise<number>> = {
    coracao: (_q, p) => coracaoGrande(p), champanhe, anel, coroa, leao, diamante,
  };
  const fila: Array<[string, Presente, string | null | undefined]> = []; let ocupado = false;
  const seguinte = async () => {
    const x = fila.shift(); if (!x || !vivo) { ocupado = false; return; } ocupado = true;
    let T = 0; try { T = await CENAS[x[1].key](x[0], x[1], x[2]); } catch (e) { console.warn('presente', e); }
    setTimeout(() => void seguinte(), T + 100);
  };

  return {
    mostrar(p, quem, avatar) {
      if (!vivo) return; strip(p, quem, avatar);
      if (p.key === 'beijo') { beijo(); return; }
      if (CENAS[p.key]) { fila.push([quem, p, avatar]); if (!ocupado) void seguinte(); }
    },
    coracao() {
      const e = el('pz-heart', ['❤️', '💖', '💗', '🧡'][Math.floor(Math.random() * 4)]);
      e.style.setProperty('--dx', rnd(-70, -10) + 'px'); setTimeout(() => e.remove(), 1900);
    },
    parar() {
      vivo = false; cancelAnimationFrame(raf); for (const a of active) a.end?.(); active.clear();
      try { fl?.close(); } catch { /* já fechado */ }
      R.dispose(); env.dispose(); gemEnv.dispose(); canvas.remove(); lanes.remove();
    },
  };
}
