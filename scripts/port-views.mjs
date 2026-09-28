/**
 * Porta as quatro vistas grandes de `js/views/*.js` para `src/lib/views/*.ts`.
 *
 * Existe como script e não à mão por duas razões, ambas sobre codificação e
 * colunas — o que falhou quando isto foi feito com comandos PowerShell avulsos:
 *
 *  1. O PowerShell lê um `.js` sem BOM como ANSI (cp1252) quando não se diz o
 *     contrário, e o `Set-Content -Encoding UTF8` depois grava o estrago. Os
 *     acentos de "Fã" viravam "FÃ£". O Node lê e escreve UTF-8 sem BOM por
 *     omissão, sem opções a esquecer.
 *
 *  2. As anotações de tipo são inseridas por posição (linha, coluna) que o
 *     `tsc` reporta. A coluna é 1-based e aponta para o INÍCIO do nome do
 *     parâmetro, portanto para escrever `x: tipo` o corte é em `col - 1 + nome.length`.
 *     Com `col - 1` o tipo saía antes do nome e produzia `tabVisao(: anyc)`.
 *
 * O ficheiro é sempre reconstruído a partir de `js/views/*.js`, que fica
 * intacto — por isso este script pode ser corrido quantas vezes for preciso
 * sem acumularAnnotated erros.
 *
 *   node scripts/port-views.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const VIEWS = ['studio', 'admin', 'fan', 'public'];

/**
 * Helper injektado em cada vista.
 *
 * `S.me` é `Profile | null`, e estas vistas só correm com sessão iniciada — o
 * router em `lib/main.ts` redirecciona para #inicio sem `S.me` e para #registar
 * com o perfil por onboardar. O `.js` original confiava nisso e escrevia
 * `S.me.name` em todo o lado, o que com JavaScript era correcto e com
 * TypeScript dava 156 erros de "possibly null" sem nenhum deles ser um bug real.
 *
 * O nome leva um underscore porque já existem variáveis locais chamadas `me`
 * nestas vistas (`msgHTML`, `mediaHTML`, `postCard`): um `me()` ao nível do
 * módulo seria sombreado por elas e `me().id` passaria a ser `true.id`.
 */
const HELPER = `
/**
 * \`S.me\` com o nulo resolvido.
 *
 * Estas vistas só são chamadas com sessão iniciada — o router (\`lib/main.ts\`)
 * redirecciona para #inicio quando não há \`S.me\`, e para #registar quando o
 * perfil ainda não está onboarding. O \`.js\` original confiava nisso e usava
 * \`S.me.name\` em todo o lado; o compilador não pode saber, e um \`!\` repetido em
 * cada acesso era ilegível.
 *
 * O nome tem um underscore porque já existem locals chamados \`me\` neste ficheiro
 * (\`msgHTML\`, \`mediaHTML\`) — um \`me()\` ao nível do módulo seria sombreado por
 * eles, e \`me().id\` passava a ser \`true.id\`.
 */
const me_ = (): Profile => S.me!;
`;

/** Tipos por nome de parâmetro, onde o nome diz o suficiente. */
const TIPO_POR_NOME = {
  // O contrato do despachante global: o handler recebe o `dataset` inteiro
  // do elemento (`data-v`, `data-id`, `data-price` chegam aqui como strings).
  d: 'Record<string, string>',
  limit: 'number',
  f: 'HTMLFormElement',
  // `FormControl` (o union de `types.ts`), não `HTMLElement`. O alvo de um
  // `change` é sempre um control de formulário, e as vistas fazem `t.value` e
  // `t.name` em todo o lado: com `HTMLElement` cada um desses sítios dava erro e
  // acabava resolvido por um `as` individual, que é perder a verificação de
  // tipos exactamente onde ela servia.
  //
  // Estreitar o `ChangeFn` para `HTMLInputElement` também não resolvia: uma
  // função que só aceita `HTMLInputElement` não é atribuível a um tipo que pode
  // passar um `HTMLElement` (os parâmetros são contravariantes, e o compilador
  // tem razão) — daí o union completo, e não um só membro.
  t: 'FormControl',
};

/** Correções de importação ao passar de `.js` para a resolução do Next. */
function portar(nome) {
  let t = readFileSync(`js/views/${nome}.js`, 'utf8');

  // `from '../lib.js'` -> `from '../lib'`
  t = t.replace(/(from\s+')(\.[^']*)\.js(')/g, '$1$2$3');

  // Insere o import do tipo e o helper depois da ÚLTIMA linha de import.
  const linhas = t.split('\n');
  let ultimo = -1;
  for (let i = 0; i < linhas.length; i++) {
    if (/^import /.test(linhas[i])) ultimo = i;
  }
  if (ultimo < 0) throw new Error(`${nome}.js: nenhuma linha de import encontrada`);
  linhas.splice(ultimo + 1, 0, '', "import type { FormControl, Profile } from '../types';", ...HELPER.split('\n').slice(1, -1));
  t = linhas.join('\n');

  // `S.me!.x` e `S.me.x` -> `me_().x`. Não toca em `S.me?.x` (que é a forma
  // segura, e deve continuar segura) nem em `S.me && ...` (guarda de nulo real).
  t = t.replace(/S\.me!\./g, 'me_().').replace(/S\.me\./g, 'me_().');

  return t;
}

/**
 * Correcções que só fazem sentido depois de tipado.
 *
 *  - `S.reg = { data: {...} }` (o registo normal) ficava com `i`, `upgrade` e
 *    `files` a `undefined`. Agora o tipo `Reg` exige os três, e esta construção
 *    põe-nos a zero. Sem isto, ou o tipo era todo opcional e perdia-se o
 *   Cormick de `r.i`, ou a atribuição deixava de compilar.
 *
 *  - `S.reg.x` -> `S.reg!.x`. As vistas de etapas são só alcançadas quando
 *    `S.reg` não é nulo (o `vOnboarding` chama `startOnboarding()` nesse caso),
 *    mas o compilador não prova isso porque o valor muda entre linhas.
 */
function afinarReg(t) {
  return t
    .replace(
      "S.reg = { data: { name, email, country } };",
      "S.reg = { i: 0, upgrade: false, files: {}, data: { tipo: 'fa', interests: [], handle: '', name, email, country } };",
    )
    // `const r = S.reg, d = r.data` — a vírgula escapa ao `S.reg.` de baixo, por
    // isso a atribuição precisa da sua própria regra.
    .replace(/const r = S\.reg\b(?!!)/g, 'const r = S.reg!')
    .replace(/S\.reg\.(?!=)/g, 'S.reg!.');
}

/**
 * `${(data || []).length ? ... data.map(...) : ...}` dá dezenas de erros de
 * "'data' is possibly 'null'".
 *
 * O guard **não afina o tipo**: o que está em causa é a verdade de
 * `(data || []).length`, que é um número — e nada diz ao compilador que `data`
 * deixou de ser nulo dentro do ramo verdadeiro. Trocar por `data?.length` não
 * resolve, pela mesma razão.
 *
 * A correcção é repetir o `|| []` no `.map` — que é o que o autor já fazia à
 * mão noutros sítios do mesmo ficheiro. Aqui é feito à procura do `.map` que
 * segue o guard, para não tocar no resto do ficheiro.
 */
function segurarLista(t) {
  const guard = /\$\{\((\w+) \|\| \[\]\)\.length \?/g;
  let saida = '';
  let ultimo = 0;
  let m;
  while ((m = guard.exec(t)) !== null) {
    const v = m[1];
    const alvo = v + '.map(';
    const prox = t.indexOf(alvo, m.index + m[0].length);
    // Só aceita o `.map` dentro da mesma expressão. Sem nenhum a seguir, não
    // há nada a corrigir e o guard fica como estava.
    if (prox < 0 || prox - (m.index + m[0].length) > 2000) continue;
    saida += t.slice(ultimo, prox) + `(${v} || []).map(`;
    ultimo = prox + alvo.length;
  }
  return saida + t.slice(ultimo);
}

/**
 * Tabelas de consulta escritas como literal de objecto e indexadas por chave
 * dinâmica: `RL[u.role]`, `{ card: 'Cartão', ... }[p.content_type]`.
 *
 * O TypeScript recusa indexar um literal com uma `string` que não está entre
 * as chaves, e tem razão: se a base de dados trouxer um estado que o código não
 * conhece, isso é uma célula em branco no ecrã, e o `|| fallback` a seguir não
 * protege porque o erro é de compilação, não de runtime.
 *
 * `Record<string, string>` diz o que se pretende: qualquer chave, valor
 * `string`. O fallback em runtime continua lá.
 */
const consulta = (chaves) => [
  [new RegExp(`\\bconst (${chaves}) = \\{`, 'g'), 'const $1: Record<string, string> = {'],
];

/**
 * Substituições por vista. Todas literais, para não deslocar linhas umas em
 * relação às outras. Cada par é `[procurar, substituir]`.
 *
 * Vivem aqui, e não como edições soltas nos `.ts`, porque estes quatro ficheiros
 * são GERADOS a partir de `js/views/*.js`. Uma correcção feita directamente no
 * `.ts` desaparecia na próxima execução deste script, em silêncio.
 */
const AJUSTES = {
  public: [
    ["const d = S.reg?.data || {};", "const d: Partial<RegData> = S.reg?.data ?? {};"],
    [
      "const { error } = await sb.auth.resend({ type: 'signup', email: S.reg?.data?.email });",
      "const em = S.reg?.data?.email;\n    if (!em) return showErr('#cErr', 'Recomeça o registo.'), true;\n    const { error } = await sb.auth.resend({ type: 'signup', email: em });",
    ],
    [
      "const { error } = await sb.auth.verifyOtp({ email: S.reg?.data?.email, token: code, type: 'signup' });",
      "const em = S.reg?.data?.email;\n    if (!em) return showErr('#cErr', 'Recomeça o registo.'), true;\n    const { error } = await sb.auth.verifyOtp({ email: em, token: code, type: 'signup' });",
    ],
    [
      "const s = await fn('login-handle', { handle: who, password: pw });",
      "const s = await fn<{ access_token: string; refresh_token: string }>('login-handle', { handle: who, password: pw });",
    ],
    ['S.reg!.files[t.dataset.k] = f;', 'S.reg!.files[t.dataset.k!] = f;'],

    // `RegData` vive em `state.ts`, não em `types.ts`, por isso não vem no
    // import que o `portar()` injeta. `RegData` é usado em `Partial<RegData>` e
    // na construção do `S.reg`.
    [
      "import { S, loadMe, netPct, isStaff } from '../state';",
      "import { S, loadMe, netPct, isStaff } from '../state';\nimport type { RegData } from '../state';",
    ],

    // As colunas de `profiles` são `string | null`, e `RegData.cat` é
    // `string | undefined`. O `?? undefined` não muda nada em runtime — mais
    // abaixo o `p_category: d.cat || CATS[0]` trata os dois como "não填".
    [
      '...(c ? { cat: c.category, bio: c.bio, city: c.city, price: c.price || 2500, pmode: c.price ? \'paid\' : \'free\' } : {})',
      '...(c ? { cat: c.category ?? undefined, bio: c.bio ?? undefined, city: c.city ?? undefined, price: c.price || 2500, pmode: c.price ? \'paid\' : \'free\' } : {})',
    ],

    // `STEP[k].t` — o `k` vem do índice do passo, que é uma string. O `as`
    // declara que a tabela aceita qualquer passo, e o `[i] || STEP[0]` do
    // código trata o caso impossível.
    ['const STEP = {', 'const STEP: Record<string, { t: string; d: string }> = {'],
    ['const P = {', 'const P: Record<string, string> = {'],

    // `readOb` escreve no registo por nome de campo lido do DOM: o mapa é
    // `id do input` -> `chave de RegData`. Isso é escrita dinâmica por
    // natureza, e o `RegData` compilado não a deixaria (indexar por `string`
    // exige que *todas* as chaves aceitem `string`, o que não é verdade para
    // `price: number`). O registo continua `RegData` em `S.reg`; só esta função o
    // vê como o mapa que é.
    //
    // O alvo tem `(id)` sem tipo porque o `ajustar` corre ANTES do anotador.
    // O `S.reg.data` do original já vem `S.reg!.data` do `afinarReg`.
    [
      "const d = S.reg!.data, v = (id) => { const e = $('#' + id); return e ? e.value.trim() : undefined; };",
      "const d = S.reg!.data as Record<string, any>, v = (id) => { const e = $('#' + id); return e ? e.value.trim() : undefined; };",
    ],
    [
      'const map = { oName: \'name\', oHandle: \'handle\', oBirth: \'birth\', oCat: \'cat\', oPrice: \'price\', oBio: \'bio\', oCity: \'city\', oBank: \'bank\', oHolder: \'holder\', oIban: \'iban\' };',
      'const map: Record<string, string> = { oName: \'name\', oHandle: \'handle\', oBirth: \'birth\', oCat: \'cat\', oPrice: \'price\', oBio: \'bio\', oCity: \'city\', oBank: \'bank\', oHolder: \'holder\', oIban: \'iban\' };',
    ],

    // `new Date(...)` devolve um `Date`, e subtrair um `Date` de um `number` só
    // funciona em JS pela coerção implícita. `.getTime()` é essa coerção escrita.
    // O `!` no `birth` é exacto: a linha de cima já devolveu se `birth` fosse
    // vazio.
    [
      '(Date.now() - new Date(d.birth)) / 31557600000',
      '(Date.now() - new Date(d.birth!).getTime()) / 31557600000',
    ],

    // O onboarding só é alcançado com sessão iniciada — o `vOnboarding` chama
    // `startOnboarding()` precisamente quando `S.me` existe. Mesmo raciocínio
    // que o já existente `S.reg!` duas linhas acima.
    [
      'const uid = S.session.user.id, prog = $(\'#upProg\');',
      'const uid = S.session!.user.id, prog = $(\'#upProg\');',
    ],
    [".neq('id', S.session.user.id)", ".neq('id', S.session!.user.id)"],

    // `paths` é preenchido por `for (const k of ['front', 'back', 'selfie'])` e
    // lido logo a seguir por nome — é um `Record<string, string>`.
    ['const paths = {}; let n = 0;', 'const paths: Record<string, string> = {}; let n = 0;'],
    // `validOb('identidade')` já devolveu se faltar algum dos três; o `!` diz
    // isso ao compilador em vez de repetir a verificação.
    ['const f = r.files[k];', 'const f = r.files[k]!;'],

    // `t.files` só existe em `HTMLInputElement`. O `FormControl` do `ChangeFn`
    // é a union dos três controlos, porque `.value`/`.name` são de todos; este
    // é o único ponto em que se sabe que o alvo é um input de ficheiro (o
    // `classList.contains('kycfile')` logo ao lado é a prova).
    [
      "if (t.classList.contains('kycfile') && t.files[0]) {",
      "if (t.classList.contains('kycfile') && (t as HTMLInputElement).files![0]) {",
    ],
    ['const f = t.files[0];', 'const f = (t as HTMLInputElement).files![0];'],
  ],

  admin: [
    // `tagSt` devolve `({...})[s] || esc(s)`. Sem tipo de retorno declarado, o
    // compilador推理 um `any` para o literal indexado por uma chave dinâmica.
    // NOTA sobre os alvos que são parâmetros: o `ajustar` corre ANTES do `tsc`
    // anotar os parâmetros, por isso o texto procurado é o de `js/views/*.js`
    // (sem tipo) e o substituto já traz o tipo certo — o anotador não volta a
    // mexer nele. Escrever o alvo já anotado aqui não encontraria nada.
    ['const tagSt = (s) => ({', 'const tagSt = (s: string): string => ({'],
    // O original é `=> ({ ... }[s] || esc(s))` — o `(` depois da seta fecha no
    // `)` final, e o de `esc(` fecha antes. Ao mover o fecho do grupo para antes
    // do `[s]` (que é o que o `as` exige), o `)` do fim sobra e a linha deixa de
    // fechar: daí `esc(s);` e não `esc(s));`.
    [
      "'<span class=\"tag plain\">Suspenso</span>' }[s] || esc(s));",
      "'<span class=\"tag plain\">Suspenso</span>' } as Record<string, string>)[s] || esc(s);",
    ],
    // `age` recebe uma data ISO, não o dataset de um botão. O anotador
    // automático viu o nome `d` e deu-lhe `Record<string, string>`; aqui está
    // o que o código realmente recebe.
    [
      'const age = (d) => d ?',
      'const age = (d: string | null | undefined) => d ?',
    ],
    [
      'function waitingBadge(created_at) {',
      'function waitingBadge(created_at: string | null) {',
    ],
    // `Date.now() - new Date(d)` é aritmética válida em JS porque o `Date` se
    // converte a número sozinho, mas o compilador recusa subtrair um `Date` de um
    // `number`. `.getTime()` é essa mesma conversão, à mão — o número em ecrã é
    // idêntico. O `?? 0` no `created_at` é o `new Date(null)` original (epoch),
    // que o JS aceitava e o `Date` não tem overload para.
    [
      'Math.floor((Date.now() - new Date(d)) / 31557600000)',
      'Math.floor((Date.now() - new Date(d).getTime()) / 31557600000)',
    ],
    [
      '(Date.now() - new Date(created_at)) / 3600000',
      '(Date.now() - new Date(created_at ?? 0).getTime()) / 3600000',
    ],
    [
      "{ post: 'Publicação', creator: 'Perfil', message: 'Mensagem', live: 'Live' }[r.target_type]",
      "({ post: 'Publicação', creator: 'Perfil', message: 'Mensagem', live: 'Live' } as Record<string, string>)[r.target_type]",
    ],
    ...consulta('RL'),
    [
      "for (const i of document.querySelectorAll('.setinp')) {",
      "for (const i of document.querySelectorAll<HTMLInputElement>('.setinp')) {",
    ],
    [
      "[...document.querySelectorAll('.vchk')].some((c) => !c.checked)",
      "[...document.querySelectorAll<HTMLInputElement>('.vchk')].some((c) => !c.checked)",
    ],
    ['const f = t.files[0];', 'const f = (t as HTMLInputElement).files![0];'],
    // As duas tabelas de tradução de promoções, indexadas por um valor que vem
    // da base de dados (`p.content_type`, `p.position`). O `|| p.x` a seguir
    // é o que trata um estado novo que o código não conheça.
    [
      "const posL = { topo: 'Topo', esquerda: 'Lado esquerdo', direita: 'Lado direito' };",
      "const posL: Record<string, string> = { topo: 'Topo', esquerda: 'Lado esquerdo', direita: 'Lado direito' };",
    ],
    [
      "const typeL = { card: 'Cartão', media: 'Vídeo/GIF', html: 'HTML' };",
      "const typeL: Record<string, string> = { card: 'Cartão', media: 'Vídeo/GIF', html: 'HTML' };",
    ],
    // `data-key` está sempre no input (é ele que o desenha, na linha do
    // `<input ... data-key="${esc(s.key)}">` de cima), por isso o `!` é exacto.
    // Sem ele, `checkSetting` recebia `string | undefined` e o `r.key` de baixo
    // deixava de servir de índice para `SETTINGS_SPEC`.
    ['checkSetting(i.dataset.key, i.value)', 'checkSetting(i.dataset.key!, i.value)'],
    [
      'rows.push({ key: i.dataset.key, value: r.value });',
      'rows.push({ key: i.dataset.key!, value: r.value });',
    ],
  ],

  fan: [
    [
      'const by = { topo: [], esquerda: [], direita: [] };',
      'const by: Record<string, any[]> = { topo: [], esquerda: [], direita: [] };',
    ],
    // O `.select()` aninhado devolve `profile` como array, porque o compilador
    // não sabe que a relação é `!inner` e unitária. O `.js` não tinha tipos e
    // não se importava; aqui diz-se na letra.
    ['on.map((l) =>', 'on.map((l: any) =>'],
    ['s.map((c) =>', 's.map((c: any) =>'],
    ['const tiles = posts.flatMap(', 'const tiles: Array<{ p: any; m: any }> = posts.flatMap('],
    [
      'function tipModal(creatorId, liveId) {',
      'function tipModal(creatorId: string, liveId?: string | null) {',
    ],
    [
      'const meta = { message: msg }; if (S.tipTarget.liveId) meta.live_id = S.tipTarget.liveId;',
      "const alvo = S.tipTarget; if (!alvo) return;\n      const meta: Record<string, unknown> = { message: msg }; if (alvo.liveId) meta.live_id = alvo.liveId;",
    ],
    ['target_id: S.tipTarget.creatorId', 'target_id: alvo.creatorId'],
  ],

  studio: [
    [
      'const bk = st?.by_kind || {}, tot = Object.values(bk).reduce((a, b) => a + Number(b), 0);',
      'const bk = (st?.by_kind ?? {}) as Record<string, number>, tot = Object.values(bk).reduce((a, b) => a + b, 0);',
    ],
    ...consulta('L|K'),
    ['const d = S.draft, files = S.draftFiles || [];', 'const d = S.draft!, files = S.draftFiles || [];'],
    ["S.creator.status === 'approved' ? 'Publicado'", "S.creator!.status === 'approved' ? 'Publicado'"],
    [
      'const files = [...t.files].slice(0, 10);',
      'const files = [...((t as HTMLInputElement).files ?? [])].slice(0, 10);',
    ],
    [
      "const f = t.files[0]; t.value = ''; if (!f) return true;",
      "const f = (t as HTMLInputElement).files![0]; (t as HTMLInputElement).value = ''; if (!f) return true;",
    ],
    ["path.split('/').pop(), { type: 'image/jpeg' }", "path.split('/').pop()!, { type: 'image/jpeg' }"],
  ],
};

/** Aplica as substituições de uma vista, e falha se alguma não encontrar alvo.
 *
 *  Aceita string ou RegExp. Aceitar os dois é o que permite ao `consulta()`
 *  acima usar um padrão (paraSeveral regras `const L = {` / `const K = {`) em
 *  vez de repetir a substituição à mão.
 *
 *  Falhar alto é de propósito: se o `js/views/*.js` mudar e um alvo deixar de
 *  existir, o script pára com a mensagem em vez de escrever um ficheiro meio
 *  corrigido — que é o que tornaria a próxima execução enganadora.
 */
function ajustar(nome, t) {
  for (const [procurar, substituir] of AJUSTES[nome] ?? []) {
    const achou = procurar instanceof RegExp ? procurar.test(t) : t.includes(procurar);
    if (!achou) {
      const alvo = procurar instanceof RegExp ? procurar.toString() : procurar;
      throw new Error(`${nome}.ts: não encontrei o alvo da correcção:\n  ${alvo.slice(0, 120)}`);
    }
    // Substitui TODAS as ocorrências: `const f = t.files[0]` aparece duas vezes
    // em admin.ts, e a segunda ficava por corrigir em silêncio.
    t = procurar instanceof RegExp
      ? t.replace(procurar, substituir)
      : t.split(procurar).join(substituir);
  }
  return t;
}

/** Corre o `tsc` e devolve os erros TS7006 agrupados por ficheiro. */
function errosTS7006() {
  let saida = '';
  try {
    // `shell: true` é obrigatório no Windows: sem ele o Node não consegue
    // lançar o `npx.cmd` (os executáveis .cmd precisam de um interpretador de
    // comandos por trás). Sem isto o execFileSync falha com status null e zero
    // bytes de saída, e o script acha que o tsc não viu erros.
    saida = execFileSync('npx.cmd', ['tsc', '--noEmit'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });
  } catch (e) {
    saida = `${e.stdout || ''}${e.stderr || ''}`;
    if (!saida.trim()) throw new Error(`tsc não produziu saída: ${e.message}`);
  }
  const porFicheiro = new Map();
  for (const linha of saida.split('\n')) {
    // Um erro de SINTAXE impede o `tsc` de fazer a análise semântica do
    // ficheiro, portanto esse ficheiro passa a reportar ZERO TS7006. Sem este
    // guarda, o ciclo de anotação achava que não havia nada a fazer e imprimia
    // "0 anotações" com o ficheiro partido — foi exactamente o que aconteceu
    // com o parêntESE sobrando no `tagSt`.
    //
    // Só estes três códigos: são erros de gramática. Um padrão largo como
    // `TS1\d\d\d` apanharia também o TS18048 ('x' is possibly 'null'), que é
    // semântico e não impede a anotação.
    const sintaxe = linha.match(/^(src\/\S+)\((\d+),(\d+)\): error (TS1005|TS1110|TS1128):/);
    if (sintaxe) throw new Error(`erro de sintaxe em ${sintaxe[1]}:${sintaxe[2]}\n  ${linha.trim()}`);

    const m = linha.match(/^src\/(.+)\((\d+),(\d+)\): error TS7006: Parameter '(\w+)' implicitly has an 'any' type/);
    if (!m) continue;
    const [, ficheiro, linha_, col, nome] = m;
    if (!porFicheiro.has(ficheiro)) porFicheiro.set(ficheiro, []);
    porFicheiro.get(ficheiro).push({ linha: +linha_, col: +col, nome });
  }
  return porFicheiro;
}

function anotar(ficheiro, alvos) {
  const caminho = `src/${ficheiro}`;
  const linhas = readFileSync(caminho, 'utf8').split('\n');

  // De trás para a frente na MESMA linha, e de baixo para cima entre linhas:
  // inserir na frente mantinha válidas as colunas ainda por tratar.
  for (const a of alvos.sort((x, y) => y.linha - x.linha || y.col - x.col)) {
    const i = a.linha - 1;
    const l = linhas[i];
    if (l === undefined) throw new Error(`${caminho}:${a.linha} não existe`);
    const corte = a.col - 1 + a.nome.length; // logo a seguir ao nome do parâmetro
    const tipo = TIPO_POR_NOME[a.nome] ?? 'any';
    if (l.slice(a.col - 1, corte) !== a.nome) {
      throw new Error(`${caminho}:${a.linha}:${a.col} esperava "${a.nome}", encontrou "${l.slice(a.col - 1, corte)}"`);
    }
    linhas[i] = l.slice(0, corte) + ': ' + tipo + l.slice(corte);
  }
  writeFileSync(caminho, linhas.join('\n'), 'utf8');
  return alvos.length;
}

// --- 1. reconstruir -----------------------------------------------------------
for (const nome of VIEWS) {
  let t = portar(nome);
  if (nome === 'public') t = afinarReg(t);
  t = segurarLista(t);
  t = ajustar(nome, t);
  writeFileSync(`src/lib/views/${nome}.ts`, t, 'utf8');
}
console.log(`regenerados: ${VIEWS.map((v) => v + '.ts').join(', ')}`);

// --- 2. anotar, com posições frescos do tsc ----------------------------------
let total = 0;
for (let volta = 0; volta < 5; volta++) {
  const porFicheiro = errosTS7006();
  if (!porFicheiro.size) break;
  for (const [ficheiro, alvos] of porFicheiro) {
    total += anotar(ficheiro, alvos);
  }
  console.log(`volta ${volta + 1}: ${porFicheiro.size} ficheiro(s), ${[...porFicheiro.values()].flat().length} anotações`);
}

// --- 3. verificar que os acentos sobreviveram --------------------------------
const amostra = readFileSync('src/lib/views/fan.ts', 'utf8');
const primeiraLinha = amostra.split('\n')[0];
if (!primeiraLinha.includes('Fã') || !primeiraLinha.includes('início')) {
  throw new Error(`codificação estragada em fan.ts: ${primeiraLinha}`);
}
console.log(`\ntotal de parâmetros anotados: ${total}`);
console.log('acentos intactos: sim');
