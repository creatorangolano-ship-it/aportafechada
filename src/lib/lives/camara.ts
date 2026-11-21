// Câmara de quem faz a live: virar (frente/trás) e filtros de beleza, como no TikTok.
// A imagem da câmara passa por um shader WebGL (pele suavizada, brilho, cor) e é o resultado
// (canvas.captureStream) que vai para o LiveKit — assim os fãs veem a imagem já com o filtro.

export type Filtro = 'natural' | 'beleza' | 'brilho' | 'quente' | 'frio' | 'vivo' | 'pb';

/** [chave, nome, emoji] pela ordem em que aparecem na gaveta. */
export const FILTROS: [Filtro, string, string][] = [
  ['natural', 'Normal', '🙂'], ['beleza', 'Beleza', '✨'], ['brilho', 'Brilho', '☀️'],
  ['quente', 'Quente', '🌅'], ['frio', 'Frio', '❄️'], ['vivo', 'Vívido', '🌈'], ['pb', 'P&B', '🎞️'],
];

/** suavizar, brilho, calor, saturação, contraste, cinzento */
const PARAM: Record<Filtro, [number, number, number, number, number, number]> = {
  natural: [0, 1, 0, 1, 1, 0],
  beleza: [0.75, 1.06, 0.25, 1.05, 0.98, 0],
  brilho: [0.45, 1.14, 0.1, 1.08, 0.95, 0],
  quente: [0.35, 1.04, 0.9, 1.1, 1, 0],
  frio: [0.35, 1.03, -0.8, 0.98, 1.02, 0],
  vivo: [0.25, 1.03, 0.15, 1.35, 1.08, 0],
  pb: [0.3, 1.05, 0, 1, 1.12, 1],
};

const VS = 'attribute vec2 p;varying vec2 v;void main(){v=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';
const FS = `precision mediump float;varying vec2 v;uniform sampler2D t;uniform vec2 px;
uniform float sm,br,wa,sa,co,gr;
void main(){
 vec3 c=texture2D(t,v).rgb;
 if(sm>0.){
  vec3 s=vec3(0.);float w=0.;
  for(int i=-3;i<=3;i++)for(int j=-3;j<=3;j++){
   vec2 o=vec2(float(i),float(j));
   vec3 q=texture2D(t,v+o*px*2.).rgb;
   float d=distance(q,c);
   float k=exp(-d*d*28.)*exp(-dot(o,o)/18.);
   s+=q*k;w+=k;}
  c=mix(c,s/w,sm);
 }
 c*=br;c=(c-.5)*co+.5;
 c.r+=wa*.05;c.g+=wa*.012;c.b-=wa*.05;
 float l=dot(c,vec3(.299,.587,.114));
 c=mix(vec3(l),c,sa);c=mix(c,vec3(l),gr);
 gl_FragColor=vec4(clamp(c,0.,1.),1.);
}`;

export interface Camara {
  /** A faixa de vídeo (com filtro) que se publica no LiveKit. */
  track: MediaStreamTrack;
  /** true quando é a câmara da frente (a pré-visualização de quem transmite fica em espelho). */
  frente: boolean;
  filtro: Filtro;
  virar(): Promise<void>;
  escolher(f: Filtro): void;
  /** Liga/desliga a câmara a sério (a luz da câmara apaga quando está desligada). */
  ligar(on: boolean): Promise<void>;
  parar(): void;
}

const guardado = (): Filtro => {
  try { const f = localStorage.getItem('lvFiltro') as Filtro | null; if (f && f in PARAM) return f; } catch { /* sem armazenamento */ }
  return 'beleza';
};

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
  const gl = cv.getContext('webgl', { preserveDrawingBuffer: false, antialias: false }) as WebGLRenderingContext | null;
  // Sem WebGL: publica a câmara tal como está (sem filtros).
  if (!gl) {
    const cam: Camara = {
      track: raw.getVideoTracks()[0], frente: true, filtro: 'natural',
      async virar() { throw new Error('Este aparelho não deixa virar a câmara durante a live.'); },
      escolher() { /* sem filtros */ },
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
  const U = Object.fromEntries(['px', 'sm', 'br', 'wa', 'sa', 'co', 'gr'].map((n) => [n, gl.getUniformLocation(pr, n)]));

  let ativo = true, ligada = true;
  const cam: Camara = { track: null as unknown as MediaStreamTrack, frente: true, filtro: guardado(), virar, escolher, ligar, parar };

  // Desenha a 30 imagens por segundo (requestAnimationFrame com limite). requestVideoFrameCallback
  // falhava em alguns navegadores com o vídeo fora da página, e a imagem congelava.
  let ultimo = 0;
  const desenha = (agora = performance.now()) => {
    if (!ativo) return;
    requestAnimationFrame(desenha);
    if (agora - ultimo < 1000 / 31) return;
    ultimo = agora;
    if (!ligada || vid.readyState < 2 || !vid.videoWidth) return;
    if (cv.width !== vid.videoWidth || cv.height !== vid.videoHeight) { cv.width = vid.videoWidth; cv.height = vid.videoHeight; gl.viewport(0, 0, cv.width, cv.height); }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, vid);
    const [sm, br, wa, sa, co, gr] = PARAM[cam.filtro];
    // O raio da suavização acompanha a resolução (o mesmo efeito em 480p e em 1080p).
    const esc = Math.max(1, Math.min(cv.width, cv.height) / 720);
    gl.uniform2f(U.px, esc / cv.width, esc / cv.height);
    gl.uniform1f(U.sm, sm); gl.uniform1f(U.br, br); gl.uniform1f(U.wa, wa); gl.uniform1f(U.sa, sa); gl.uniform1f(U.co, co); gl.uniform1f(U.gr, gr);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  desenha();
  cam.track = cv.captureStream(30).getVideoTracks()[0];

  async function virar() {
    const novo = await abrir(!cam.frente).catch(() => { throw new Error('Este aparelho só tem uma câmara.'); });
    raw.getTracks().forEach((t) => t.stop());
    raw = novo; vid.srcObject = raw; await vid.play().catch(() => {});
    cam.frente = !cam.frente;
  }
  function escolher(f: Filtro) {
    cam.filtro = f;
    try { localStorage.setItem('lvFiltro', f); } catch { /* sem armazenamento */ }
  }
  async function ligar(on: boolean) {
    if (on === ligada) return;
    if (on) { raw = await abrir(cam.frente).catch(() => abrir(true)); vid.srcObject = raw; await vid.play().catch(() => {}); ligada = true; }
    else { ligada = false; raw.getTracks().forEach((t) => t.stop()); }
  }
  function parar() { ativo = false; raw.getTracks().forEach((t) => t.stop()); cam.track.stop(); }
  return cam;
}
