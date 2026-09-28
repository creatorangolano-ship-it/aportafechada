/**
 * Verifica as regras da arquitetura em camadas (corre em `npm run verify`).
 *
 *   domain          → só importa domain (e sempre com extensão .ts)
 *   application     → só importa domain e application
 *   infrastructure  → não importa a interface (src/lib)
 *   interface       → as áreas migradas não falam com o Supabase directamente;
 *                     passam pela camada de aplicação (via infrastructure/composicao)
 *
 * Também mostra quantas chamadas directas ao Supabase restam nas áreas ainda
 * não migradas (a dívida da próxima fase).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const RAIZ = 'src';
const MIGRADAS = ['src/lib/views/admin.ts', 'src/lib/pay.ts'];

const ficheiros = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? ficheiros(p) : /\.tsx?$/.test(n) ? [p] : [];
});
const norm = (p) => p.split(sep).join('/');
const imports = (src) => [...src.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1])
  .concat([...src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]));
/** Resolve um import relativo para o caminho a partir de src/ (ou devolve o nome do pacote). */
const alvo = (de, imp) => imp.startsWith('.') ? norm(join(de, '..', imp)) : imp.startsWith('@/') ? 'src/' + imp.slice(2) : imp;

const erros = [];
const divida = [];
for (const f of ficheiros(RAIZ).map(norm)) {
  const src = readFileSync(f, 'utf8');
  const camada = f.split('/')[1];
  const teste = f.endsWith('.test.ts'); // os testes importam node:test e node:assert
  for (const imp of imports(src)) {
    const a = alvo(f, imp);
    const destino = a.startsWith('src/') ? a.split('/')[1] : 'pacote';
    if (teste && imp.startsWith('node:')) continue;
    if (camada === 'domain') {
      if (destino !== 'domain') erros.push(`${f}: o domínio não pode importar "${imp}"`);
      else if (!imp.endsWith('.ts')) erros.push(`${f}: import do domínio sem extensão .ts ("${imp}") — os testes do Node não o resolvem`);
    }
    if (camada === 'application' && !['domain', 'application'].includes(destino)) erros.push(`${f}: a aplicação não pode importar "${imp}"`);
    if (camada === 'infrastructure' && destino === 'lib') erros.push(`${f}: a infraestrutura não pode importar a interface ("${imp}")`);
    if (MIGRADAS.includes(f) && /infrastructure\/supabase|supabase-js/.test(a)) erros.push(`${f}: área migrada a importar o Supabase directamente ("${imp}")`);
  }
  if (MIGRADAS.includes(f)) {
    const m = src.match(/\bsb\.(from|rpc|storage|channel|functions)\b|\bfn[<(]|\bsignedUrls\(|\bupload\(/);
    if (m) erros.push(`${f}: área migrada com acesso directo a dados (${m[0]})`);
  }
  if (camada === 'lib' && !MIGRADAS.includes(f)) {
    const n = (src.match(/\bsb\.(from|rpc|storage|channel|auth|functions)\b/g) || []).length;
    if (n) divida.push([relative('src/lib', f), n]);
  }
}

if (divida.length) {
  const total = divida.reduce((a, [, n]) => a + n, 0);
  console.log(`Por migrar: ${total} chamadas directas ao Supabase na interface`);
  for (const [f, n] of divida.sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${f}`);
}
if (erros.length) {
  console.error(`\n✖ ${erros.length} violação(ões) da arquitetura:`);
  for (const e of erros) console.error('  ' + e);
  process.exit(1);
}
console.log('✔ Camadas respeitadas (domain → application → infrastructure → interface).');
