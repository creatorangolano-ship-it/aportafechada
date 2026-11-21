// Câmara de quem faz a live, como no TikTok: virar (frente/trás), filtros de cor com intensidade,
// beleza ajustável (suavizar a pele, iluminar, rosto fino, olhos grandes) e efeitos de cara.
// A imagem da câmara passa por um shader WebGL (deformação + pele suavizada + cor); os efeitos
// de cara são desenhados por cima num canvas 2D, e é esse canvas (captureStream) que vai para
// o LiveKit — assim os fãs veem a imagem já com tudo aplicado.

export type Filtro = 'natural' | 'quente' | 'dourado' | 'rosado' | 'frio' | 'vivo' | 'suave' | 'pb';
export type Efeito = 'nenhum' | 'oculos' | 'gato' | 'coroa' | 'coracoes' | 'maquilhagem' | 'brilhos';
export type Beleza = 'suave' | 'luz' | 'rosto' | 'olhos';

/** [chave, nome, cores da miniatura] pela ordem em que aparecem na tira. */
export const FILTROS: [Filtro, string, string][] = [
  ['natural', 'Normal', '#8a8f98,#c9ccd2'], ['quente', 'Quente', '#c96a2b,#f3c07a'], ['dourado', 'Dourado', '#a8741a,#ffd76a'],
  ['rosado', 'Rosado', '#c45a7c,#ffc2d4'], ['frio', 'Frio', '#2f6fa8,#a9d6ff'], ['vivo', 'Vívido', '#d0103c,#2bd47d'],
  ['suave', 'Suave', '#b9a7a0,#efe6e0'], ['pb', 'P&B', '#222,#ddd'],
];

/** Ajustes de beleza: cada um com a sua barra (combinam-se entre si). */
export const BELEZA: [Beleza, string, string][] = [
  ['suave', 'Suavizar', '✨'], ['luz', 'Iluminar', '☀️'], ['rosto', 'Rosto fino', '🙂'], ['olhos', 'Olhos', '👁️'],
];

/** Efeitos de cara (seguem o rosto). */
export const EFEITOS: [Efeito, string, string][] = [
  ['nenhum', 'Nenhum', '🚫'], ['oculos', 'Óculos', '😎'], ['gato', 'Gatinha', '🐱'], ['coroa', 'Coroa', '👑'],
  ['coracoes', 'Corações', '😍'], ['maquilhagem', 'Maquilhagem', '💄'], ['brilhos', 'Brilhos', '🌟'],
];

/** Cor de cada filtro na intensidade máxima: brilho, calor, saturação, contraste, cinzento, rosa, desvanecer */
const COR: Record<Filtro, [number, number, number, number, number, number, number]> = {
  natural: [1, 0, 1, 1, 0, 0, 0],
  quente: [1.04, 0.9, 1.1, 1, 0, 0, 0],
  dourado: [1.06, 0.7, 1.15, 1.04, 0, -0.2, 0],
  rosado: [1.05, 0.15, 1.05, 0.98, 0, 0.9, 0.04],
  frio: [1.03, -0.85, 0.98, 1.02, 0, 0, 0],
  vivo: [1.03, 0.15, 1.4, 1.1, 0, 0, 0],
  suave: [1.06, 0.2, 0.85, 0.88, 0, 0.2, 0.1],
  pb: [1.05, 0, 1, 1.15, 1, 0, 0],
};

export interface Ajustes {
  filtro: Filtro;
  /** intensidade de cada filtro, 0 a 1 (fica guardada por filtro, como no TikTok) */
  fInt: Partial<Record<Filtro, number>>;
  beleza: Record<Beleza, number>;
  efeito: Efeito;
  /** intensidade de cada efeito, 0 a 1 */
  eInt: Partial<Record<Efeito, number>>;
}

const PADRAO: Ajustes = { filtro: 'natural', fInt: {}, beleza: { suave: 0.6, luz: 0.3, rosto: 0, olhos: 0 }, efeito: 'nenhum', eInt: {} };
export const BELEZA_PADRAO: Readonly<Ajustes['beleza']> = PADRAO.beleza;
export const intFiltro = (a: Ajustes, f: Filtro = a.filtro) => a.fInt[f] ?? 0.7;
export const intEfeito = (a: Ajustes, e: Efeito = a.efeito) => a.eInt[e] ?? 1;

const VS = 'attribute vec2 p;varying vec2 v;void main(){v=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';
const FS = `precision mediump float;varying vec2 v;uniform sampler2D t;uniform vec2 px;
uniform float sm,br,wa,sa,co,gr,ro,fa,lu;
uniform vec2 res,eL,eR,jL,jR,jT;uniform float eRad,eAmt,jRad,jAmt;
// Afinar o rosto (o maxilar aproxima-se do centro) e olhos maiores (lupa suave à volta de cada olho).
vec2 deforma(vec2 q){
 vec2 p=q*res,o=p;
 if(jAmt>0.){
  float a=max(0.,1.-dot(o-jL,o-jL)/(jRad*jRad));p-=(jT-jL)*jAmt*a*a;
  float b=max(0.,1.-dot(o-jR,o-jR)/(jRad*jRad));p-=(jT-jR)*jAmt*b*b;
 }
 if(eAmt>0.){
  vec2 d=o-eL;float r=length(d)/eRad;if(r<1.)p-=d*eAmt*(1.-r*r);
  d=o-eR;r=length(d)/eRad;if(r<1.)p-=d*eAmt*(1.-r*r);
 }
 return p/res;
}
void main(){
 vec2 u=deforma(v);
 vec3 c=texture2D(t,u).rgb;
 if(sm>0.){
  vec3 s=vec3(0.);float w=0.;
  for(int i=-3;i<=3;i++)for(int j=-3;j<=3;j++){
   vec2 o=vec2(float(i),float(j));
   vec3 q=texture2D(t,u+o*px*2.).rgb;
   float d=distance(q,c);
   float k=exp(-d*d*28.)*exp(-dot(o,o)/18.);
   s+=q*k;w+=k;}
  c=mix(c,s/w,sm);
 }
 // iluminar: levanta as sombras e os meios-tons sem queimar as zonas claras
 c=c+lu*.22*c*(1.-c)*2.;
 c*=br;c=(c-.5)*co+.5;
 c.r+=wa*.05;c.g+=wa*.012;c.b-=wa*.05;
 c.r+=ro*.045;c.g-=ro*.02;c.b+=ro*.02;
 float l=dot(c,vec3(.299,.587,.114));
 c=mix(vec3(l),c,sa);c=mix(c,vec3(l),gr);
 c=mix(c,vec3(.5)+c*.85,fa);
 gl_FragColor=vec4(clamp(c,0.,1.),1.);
}`;

export interface Camara {
  /** A faixa de vídeo (com filtro e efeitos) que se publica no LiveKit. */
  track: MediaStreamTrack;
  /** true quando é a câmara da frente (a pré-visualização de quem transmite fica em espelho). */
  frente: boolean;
  /** Escolhas atuais (guardadas no aparelho para a próxima live). */
  a: Ajustes;
  /** Muda uma parte das escolhas e guarda. */
  definir(m: Partial<Ajustes>): void;
  virar(): Promise<void>;
  /** Liga/desliga a câmara a sério (a luz da câmara apaga quando está desligada). */
  ligar(on: boolean): Promise<void>;
  parar(): void;
}

const CHAVE = 'lvAjustes';
function lerAjustes(): Ajustes {
  try {
    const j = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    if (j && typeof j === 'object') {
      return {
        filtro: FILTROS.some(([k]) => k === j.filtro) ? j.filtro : PADRAO.filtro,
        fInt: typeof j.fInt === 'object' && j.fInt ? j.fInt : {},
        beleza: { ...PADRAO.beleza, ...(typeof j.beleza === 'object' ? j.beleza : {}) },
        efeito: EFEITOS.some(([k]) => k === j.efeito) ? j.efeito : PADRAO.efeito,
        eInt: typeof j.eInt === 'object' && j.eInt ? j.eInt : {},
      };
    }
  } catch { /* sem armazenamento ou dados estragados */ }
  return structuredClone(PADRAO);
}
const gravarAjustes = (a: Ajustes) => { try { localStorage.setItem(CHAVE, JSON.stringify(a)); } catch { /* sem armazenamento */ } };

async function abrir(frente: boolean): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: frente ? 'user' : { exact: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
  });
}

export async function criarCamara(): Promise<Camara> {
  let raw = await abrir(true);
  const vid = document.createElement('video');
  vid.muted = true; vid.playsInline = true; vid.autoplay = true;
  vid.srcObject = raw; await vid.play().catch(() => {});

  const cv = document.createElement('canvas');
  const gl = cv.getContext('webgl', { preserveDrawingBuffer: true, antialias: false }) as WebGLRenderingContext | null;
  // Sem WebGL: publica a câmara tal como está (sem filtros nem efeitos).
  if (!gl) {
    const cam: Camara = {
      track: raw.getVideoTracks()[0], frente: true, a: structuredClone(PADRAO),
      definir() { /* sem filtros */ },
      async virar() { throw new Error('Este aparelho não deixa virar a câmara durante a live.'); },
      async ligar(on) { raw.getVideoTracks().forEach((t) => (t.enabled = on)); },
      parar() { raw.getTracks().forEach((t) => t.stop()); },
    };
    return cam;
  }
  const sh = (tipo: number, src: string) => { const s = gl.createShader(tipo)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const pr = gl.createProgram()!;
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const ap = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [k, val] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, val);
  const U = Object.fromEntries(['px', 'sm', 'br', 'wa', 'sa', 'co', 'gr', 'ro', 'fa', 'lu', 'res', 'eL', 'eR', 'jL', 'jR', 'jT', 'eRad', 'eAmt', 'jRad', 'jAmt']
    .map((n) => [n, gl.getUniformLocation(pr, n)]));

  let ativo = true, ligada = true;
  const cam: Camara = {
    track: null as unknown as MediaStreamTrack, frente: true, a: lerAjustes(),
    definir(m) { Object.assign(cam.a, m); gravarAjustes(cam.a); },
    virar, ligar, parar,
  };
  // O vídeo publicado é este canvas 2D: a imagem do WebGL + os efeitos de cara por cima.
  const out = document.createElement('canvas');
  const ctx = out.getContext('2d')!;
  const rosto = criarRosto();

  // Desenha a 30 imagens por segundo (requestAnimationFrame com limite). requestVideoFrameCallback
  // falhava em alguns navegadores com o vídeo fora da página, e a imagem congelava.
  let ultimo = 0;
  const desenha = (agora = performance.now()) => {
    if (!ativo) return;
    requestAnimationFrame(desenha);
    if (agora - ultimo < 1000 / 31) return;
    ultimo = agora;
    if (!ligada || vid.readyState < 2 || !vid.videoWidth) return;
    if (cv.width !== vid.videoWidth || cv.height !== vid.videoHeight) {
      cv.width = out.width = vid.videoWidth; cv.height = out.height = vid.videoHeight; gl.viewport(0, 0, cv.width, cv.height);
    }
    const W = cv.width, H = cv.height, a = cam.a, b = a.beleza;
    const precisa = a.efeito !== 'nenhum' || b.rosto > 0 || b.olhos > 0;
    const f = precisa ? rosto.ver(vid, agora) : null;
    gl.uniform2f(U.res, W, H);
    if (f) {
      gl.uniform2f(U.eL, f.eL.x * W, f.eL.y * H); gl.uniform2f(U.eR, f.eR.x * W, f.eR.y * H);
      gl.uniform2f(U.jL, f.jL.x * W, f.jL.y * H); gl.uniform2f(U.jR, f.jR.x * W, f.jR.y * H); gl.uniform2f(U.jT, f.jT.x * W, f.jT.y * H);
      gl.uniform1f(U.eRad, f.olho * W * 1.6); gl.uniform1f(U.eAmt, b.olhos * 0.34);
      gl.uniform1f(U.jRad, f.largura * W * 0.45); gl.uniform1f(U.jAmt, b.rosto * 0.24);
    } else { gl.uniform1f(U.eAmt, 0); gl.uniform1f(U.jAmt, 0); }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, vid);
    // Filtro de cor: mistura entre o natural e o filtro, conforme a intensidade.
    const k = a.filtro === 'natural' ? 0 : intFiltro(a);
    const n = COR.natural, c = COR[a.filtro];
    const m = (i: number) => n[i] + (c[i] - n[i]) * k;
    // O raio da suavização acompanha a resolução (o mesmo efeito em 480p e em 1080p).
    const esc = Math.max(1, Math.min(W, H) / 720);
    gl.uniform2f(U.px, esc / W, esc / H);
    gl.uniform1f(U.sm, b.suave * 0.9); gl.uniform1f(U.lu, b.luz);
    gl.uniform1f(U.br, m(0)); gl.uniform1f(U.wa, m(1)); gl.uniform1f(U.sa, m(2)); gl.uniform1f(U.co, m(3));
    gl.uniform1f(U.gr, m(4)); gl.uniform1f(U.ro, m(5)); gl.uniform1f(U.fa, m(6));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    ctx.drawImage(cv, 0, 0);
    if (f && a.efeito !== 'nenhum') desenhaEfeito(ctx, a.efeito, f, W, H, agora, intEfeito(a));
  };
  desenha();
  cam.track = out.captureStream(30).getVideoTracks()[0];

  async function virar() {
    const novo = await abrir(!cam.frente).catch(() => { throw new Error('Este aparelho só tem uma câmara.'); });
    raw.getTracks().forEach((t) => t.stop());
    raw = novo; vid.srcObject = raw; await vid.play().catch(() => {});
    cam.frente = !cam.frente;
  }
  async function ligar(on: boolean) {
    if (on === ligada) return;
    if (on) { raw = await abrir(cam.frente).catch(() => abrir(true)); vid.srcObject = raw; await vid.play().catch(() => {}); ligada = true; }
    else { ligada = false; raw.getTracks().forEach((t) => t.stop()); }
  }
  function parar() { ativo = false; raw.getTracks().forEach((t) => t.stop()); cam.track.stop(); rosto.parar(); }
  return cam;
}

/* ---------- Reconhecimento do rosto (MediaPipe, o mesmo modelo da coroa dos presentes) ---------- */

type P = { x: number; y: number };
/** Medidas do rosto em coordenadas normalizadas (0–1) da imagem. */
interface Rosto {
  eL: P; eR: P; jL: P; jR: P; jT: P; testa: P; nariz: P; queixo: P; bocheL: P; bocheR: P;
  labios: P[]; labiosDentro: P[];
  /** largura da cara e raio do olho, em fração da largura da imagem */
  largura: number; olho: number;
  /** inclinação da cabeça (radianos) */
  ang: number;
}

const LAB = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
const LAB_IN = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];
const PONTOS = ['eL', 'eR', 'jL', 'jR', 'jT', 'testa', 'nariz', 'queixo', 'bocheL', 'bocheR'] as const;

function criarRosto() {
  let fl: any = null, aCarregar = false, morto = false, ultimo: Rosto | null = null, perdido = 0, ts = 0;
  const carregar = async () => {
    aCarregar = true;
    try {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const fs = await FilesetResolver.forVisionTasks('/lives/wasm');
      const op = (delegate: 'GPU' | 'CPU') => FaceLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: '/lives/modelos/rosto.task', delegate }, runningMode: 'VIDEO', numFaces: 1 });
      const novo = await op('GPU').catch(() => op('CPU'));
      if (morto) novo.close(); else fl = novo;
    } catch (e) { console.warn('rosto', e); }
  };
  const suave = (a: P, b: P, k: number): P => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
  return {
    ver(vid: HTMLVideoElement, agora: number): Rosto | null {
      if (!fl) { if (!aCarregar) void carregar(); return null; }
      let r: any;
      ts = Math.max(ts + 1, Math.round(agora));
      try { r = fl.detectForVideo(vid, ts); } catch { return ultimo; }
      const m = r?.faceLandmarks?.[0];
      if (!m) { if (++perdido > 8) ultimo = null; return ultimo; }
      perdido = 0;
      const pt = (i: number): P => ({ x: m[i].x, y: m[i].y });
      const ar = vid.videoHeight / vid.videoWidth;
      const dist = (a: P, b: P) => Math.hypot(a.x - b.x, (a.y - b.y) * ar);
      const meio = (a: number, b: number): P => ({ x: (m[a].x + m[b].x) / 2, y: (m[a].y + m[b].y) / 2 });
      const eL = m.length > 473 ? pt(468) : meio(33, 133);
      const eR = m.length > 473 ? pt(473) : meio(362, 263);
      const nariz = pt(1), queixo = pt(152);
      const novo: Rosto = {
        eL, eR, jL: pt(172), jR: pt(397), jT: { x: (nariz.x + queixo.x) / 2, y: (nariz.y + queixo.y) / 2 },
        testa: pt(10), nariz: pt(4), queixo, bocheL: pt(50), bocheR: pt(280),
        labios: LAB.map(pt), labiosDentro: LAB_IN.map(pt),
        largura: dist(pt(234), pt(454)), olho: dist(pt(33), pt(133)) / 2,
        ang: Math.atan2((eR.y - eL.y) * ar, eR.x - eL.x),
      };
      // Suaviza entre imagens para os efeitos não tremerem.
      const u = ultimo;
      if (u) {
        const k = 0.55;
        for (const c of PONTOS) novo[c] = suave(u[c], novo[c], k);
        novo.labios = novo.labios.map((p, i) => suave(u.labios[i], p, 0.7));
        novo.labiosDentro = novo.labiosDentro.map((p, i) => suave(u.labiosDentro[i], p, 0.7));
        novo.largura = u.largura + (novo.largura - u.largura) * k;
        novo.ang = u.ang + (novo.ang - u.ang) * k;
      }
      ultimo = novo;
      return novo;
    },
    parar() { morto = true; try { fl?.close(); } catch { /* já fechado */ } fl = null; },
  };
}

/* ---------- Efeitos de cara desenhados por cima da imagem ---------- */

/** k: intensidade do efeito (0 a 1) — transparência, e tamanho nos efeitos à volta da cabeça. */
function desenhaEfeito(c: CanvasRenderingContext2D, e: Efeito, f: Rosto, W: number, H: number, t: number, k = 1): void {
  const X = (p: P) => p.x * W, Y = (p: P) => p.y * H;
  const lw = f.largura * W;                         // largura da cara em píxeis
  const mx = (X(f.eL) + X(f.eR)) / 2, my = (Y(f.eL) + Y(f.eR)) / 2;
  const ed = Math.hypot(X(f.eR) - X(f.eL), Y(f.eR) - Y(f.eL));
  const up = { x: Math.sin(f.ang), y: -Math.cos(f.ang) }; // "para cima" da cabeça
  const topo = { x: X(f.testa), y: Y(f.testa) };
  const emoji = (s: string, x: number, y: number, tam: number, rot = f.ang) => {
    c.save(); c.translate(x, y); c.rotate(rot);
    c.font = `${Math.round(tam)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s, 0, 0); c.restore();
  };
  c.save();
  c.globalAlpha = 0.25 + 0.75 * k;
  const ga = c.globalAlpha;
  if (e === 'oculos') {
    c.translate(mx, my); c.rotate(f.ang);
    const lx = ed / 2, rw = ed * 0.46, rh = ed * 0.33;
    c.strokeStyle = '#111'; c.lineCap = 'round';
    const lente = (cx: number) => {
      const g = c.createLinearGradient(0, -rh, 0, rh); g.addColorStop(0, 'rgba(18,18,26,.96)'); g.addColorStop(1, 'rgba(70,40,80,.92)');
      c.beginPath(); c.ellipse(cx, 0, rw, rh, 0, 0, Math.PI * 2); c.fillStyle = g; c.fill();
      c.lineWidth = ed * 0.06; c.stroke();
      c.beginPath(); c.ellipse(cx - rw * 0.35, -rh * 0.38, rw * 0.3, rh * 0.13, -0.45, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,.32)'; c.fill();
    };
    lente(-lx); lente(lx);
    c.lineWidth = ed * 0.07;
    c.beginPath(); c.moveTo(-lx + rw * 0.85, -rh * 0.3); c.quadraticCurveTo(0, -rh * 0.8, lx - rw * 0.85, -rh * 0.3); c.stroke();
    c.beginPath(); c.moveTo(-lx - rw, -rh * 0.2); c.lineTo(-lw * 0.5, -rh * 0.4); c.moveTo(lx + rw, -rh * 0.2); c.lineTo(lw * 0.5, -rh * 0.4); c.stroke();
  } else if (e === 'gato') {
    const orelha = (lado: number) => {
      c.save(); c.translate(topo.x, topo.y); c.rotate(f.ang);
      const bx = lado * lw * 0.3, by = lw * 0.02, h = lw * 0.42, b = lw * 0.2;
      c.beginPath(); c.moveTo(bx - b, by); c.lineTo(bx + lado * b * 0.45, by - h); c.lineTo(bx + b, by); c.closePath(); c.fillStyle = '#2b2024'; c.fill();
      c.beginPath(); c.moveTo(bx - b * 0.55, by - h * 0.08); c.lineTo(bx + lado * b * 0.32, by - h * 0.74); c.lineTo(bx + b * 0.55, by - h * 0.08); c.closePath(); c.fillStyle = '#ff8fb0'; c.fill();
      c.restore();
    };
    orelha(-1); orelha(1);
    c.translate(X(f.nariz), Y(f.nariz)); c.rotate(f.ang);
    const n = lw * 0.06;
    c.beginPath(); c.moveTo(-n, -n * 0.5); c.lineTo(n, -n * 0.5); c.lineTo(0, n * 0.6); c.closePath(); c.fillStyle = '#ff5f8f'; c.fill();
    c.strokeStyle = 'rgba(30,20,25,.85)'; c.lineWidth = Math.max(2, lw * 0.009); c.lineCap = 'round';
    for (const s of [-1, 1]) for (const k of [-1, 0, 1]) { c.beginPath(); c.moveTo(s * lw * 0.12, n * 0.9 + k * lw * 0.025); c.lineTo(s * lw * 0.4, n * 0.5 + k * lw * 0.07); c.stroke(); }
  } else if (e === 'coroa') {
    emoji('👑', topo.x + up.x * lw * 0.3, topo.y + up.y * lw * 0.3, lw * 0.75);
  } else if (e === 'coracoes') {
    // corações a girar à volta da cabeça, por cima da testa
    for (let i = 0; i < 6; i++) {
      const a = t / 900 + (i * Math.PI * 2) / 6;
      const px = Math.cos(a) * lw * 0.62, py = Math.sin(a) * lw * 0.16 - lw * 0.32;
      const x = topo.x + px * Math.cos(f.ang) - py * Math.sin(f.ang), y = topo.y + px * Math.sin(f.ang) + py * Math.cos(f.ang);
      c.globalAlpha = ga * (Math.sin(a) > 0 ? 1 : 0.75);
      emoji('❤️', x, y, lw * (0.16 + 0.05 * Math.sin(a)));
    }
  } else if (e === 'maquilhagem') {
    c.beginPath();
    f.labios.forEach((p, i) => (i ? c.lineTo(X(p), Y(p)) : c.moveTo(X(p), Y(p)))); c.closePath();
    f.labiosDentro.forEach((p, i) => (i ? c.lineTo(X(p), Y(p)) : c.moveTo(X(p), Y(p)))); c.closePath();
    c.fillStyle = 'rgba(190,20,70,.45)'; c.fill('evenodd');
    for (const b of [f.bocheL, f.bocheR]) {
      const g = c.createRadialGradient(X(b), Y(b), 0, X(b), Y(b), lw * 0.16);
      g.addColorStop(0, 'rgba(255,90,120,.3)'); g.addColorStop(1, 'rgba(255,90,120,0)');
      c.fillStyle = g; c.fillRect(X(b) - lw * 0.2, Y(b) - lw * 0.2, lw * 0.4, lw * 0.4);
    }
  } else if (e === 'brilhos') {
    const cx = (mx + X(f.queixo)) / 2, cy = (my + Y(f.queixo)) / 2;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8 + t / 2500;
      const r = lw * (0.62 + 0.06 * Math.sin(t / 300 + i));
      c.globalAlpha = ga * (0.5 + 0.5 * Math.sin(t / 200 + i * 1.7));
      emoji('✨', cx + Math.cos(a) * r, cy + Math.sin(a) * r * 1.2, lw * 0.13, 0);
    }
  }
  c.restore();
}
