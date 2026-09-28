// Verifica, sem build step, que cada import corresponde a um export real.
// Um import errado só rebenta em runtime, no browser, quando o utilizador clica.
// Executar: node check-imports.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const root = process.cwd();
const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e.endsWith('.js')) files.push(p);
  }
})(join(root, 'js'));

const exportsOf = new Map();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/).pop().trim();
      if (n) names.add(n);
    }
  }
  if (/^export\s+default/m.test(src)) names.add('default');
  exportsOf.set(f, names);
}

let problems = 0, checked = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const target = resolve(dirname(f), m[2]);
    if (!exportsOf.has(target)) continue;              // index.html/CDN: fora do âmbito
    const have = exportsOf.get(target);
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/)[0].trim();
      if (!n) continue;
      checked++;
      if (!have.has(n)) {
        console.log(`IMPORT INEXISTENTE  ${relative(root, f)}  importa "${n}" de ${m[2]} — esse módulo não o exporta`);
        problems++;
      }
    }
  }
}
console.log(problems
  ? `\n${problems} problema(s) em ${checked} imports verificados.`
  : `Tudo consistente: ${checked} imports conferem contra os exports reais.`);
process.exit(problems ? 1 : 0);
