/**
 * build.mjs | Monta a pasta dist-site que vai para o Cloudflare Pages.
 *
 * Usa lista de permissão (e não de exclusão) de propósito: assim, um arquivo
 * novo de back-end (chaves, SQL, scripts) nunca vai para o site publicado por
 * esquecimento. Para publicar algo novo, adicione aqui explicitamente.
 */
import { rm, mkdir, copyFile, cp, access } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// Pasta publicada — é COMITADA no repositório (não é build artifact).
// O Cloudflare Pages serve esta pasta direto, sem rodar build.
const OUT = path.join(ROOT, "public");

const FILES = [
  "index.html",
  "adm.html",
  "privacidade.html",
  "_redirects",
  "css/style.css",
  "js/config.js",
  "js/redutor-bg.js",
  "js/main.js",
  "js/content.js",
  "js/adm.js",
];

// Copiada só se existir (fallback local de conteúdo; em produção vem da API).
const OPTIONAL_DIRS = ["data"];

const exists = (p) => access(p).then(() => true, () => false);

await rm(OUT, { recursive: true, force: true });

for (const rel of FILES) {
  const src = path.join(ROOT, rel);
  if (!(await exists(src))) {
    console.error(`✘ arquivo esperado não encontrado: ${rel}`);
    process.exit(1);
  }
  const dest = path.join(OUT, rel);
  await mkdir(path.dirname(dest), { recursive: true });
  await copyFile(src, dest);
  console.log(`+ ${rel}`);
}

for (const dir of OPTIONAL_DIRS) {
  const src = path.join(ROOT, dir);
  if (await exists(src)) {
    await cp(src, path.join(OUT, dir), { recursive: true });
    console.log(`+ ${dir}/`);
  }
}

console.log(`\n✔ public/ pronto (${FILES.length} arquivos) — commite esta pasta`);
