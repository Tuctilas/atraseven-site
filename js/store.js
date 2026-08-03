/**
 * store.js | Camada de armazenamento do conteúdo editável do site.
 *
 * Em produção (Render): usa Cloudflare R2 (API S3-compatível) se as variáveis
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET e
 *   R2_PUBLIC_BASE estiverem definidas.
 * Em desenvolvimento: fallback local — data/content.json + pasta uploads/.
 *
 * O R2 guarda dois tipos de objeto no mesmo bucket:
 *   • content.json          → contato + lista de fotos (o "banco" do site)
 *   • photos/<arquivo>       → as imagens enviadas pela área ADM
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_FILE = path.join(ROOT, "data", "content.json");
const UPLOAD_DIR = path.join(ROOT, "uploads");

export const DEFAULT_CONTENT = {
  contact: {
    whatsappLabel: "+55 (31) 3033-0708",
    whatsappNumber: "553130330708",
    email: "vendas@atraseven.com.br",
    linkedin: "linkedin.com/company/atra-seven",
  },
  presentation: [],
  services: {},
};

/* ── seleção do backend ── */
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET = process.env.R2_BUCKET || "";
// URL pública do bucket (r2.dev ou domínio próprio), sem barra no final
const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || "").replace(/\/$/, "");

export const useR2 = !!(
  R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET && R2_PUBLIC_BASE
);

const CONTENT_KEY = "content.json";
// base pública das imagens locais (precisa ser absoluta: o site roda em outra porta)
const PUBLIC_BASE = process.env.PUBLIC_BASE || "http://localhost:" + (process.env.PORT || 3000);
export { UPLOAD_DIR };

let s3 = null;
let GetObjectCommand, PutObjectCommand, DeleteObjectCommand;
if (useR2) {
  const aws = await import("@aws-sdk/client-s3");
  ({ GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = aws);
  s3 = new aws.S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
} else if (process.env.NODE_ENV === "production") {
  console.warn("[store] R2 não configurado — usando armazenamento local EFÊMERO. " +
    "Em produção, defina R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET e R2_PUBLIC_BASE.");
}

/* ── conteúdo (telefone, e-mail, fotos) ── */
export async function getContent() {
  if (useR2) {
    try {
      const r = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: CONTENT_KEY }));
      const text = await r.Body.transformToString();
      return normalize(JSON.parse(text));
    } catch (e) {
      // objeto ainda não existe (primeiro acesso) → devolve o padrão
      if (e.name === "NoSuchKey" || e.$metadata?.httpStatusCode === 404) return { ...DEFAULT_CONTENT };
      throw e;
    }
  }
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return normalize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CONTENT };
  }
}

export async function saveContent(content) {
  const data = normalize(content);
  if (useR2) {
    await s3.send(new PutObjectCommand({
      Bucket: R2_BUCKET, Key: CONTENT_KEY,
      Body: JSON.stringify(data), ContentType: "application/json",
    }));
    return data;
  }
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  return data;
}

/* ── segredo do admin (hash de senha, já CIFRADO pela API) ──
   Fica SEPARADO do content.json de propósito: aquele é servido publicamente
   por GET /api/content e não pode carregar segredo nenhum. Aqui guardamos um
   blob opaco (a API cifra antes de gravar e decifra ao ler), então mesmo que
   este objeto seja lido, não revela a senha.
   Local (dev): .admin-secret.json na RAIZ — fora de data/, que o build publica,
   e no .gitignore. Produção: objeto admin.json no mesmo bucket R2. */
const ADMIN_KEY = "admin.json";
const ADMIN_FILE = path.join(ROOT, ".admin-secret.json");

export async function getAdminSecret() {
  if (useR2) {
    try {
      const r = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: ADMIN_KEY }));
      const j = JSON.parse(await r.Body.transformToString());
      return typeof j.secret === "string" ? j.secret : "";
    } catch (e) {
      if (e.name === "NoSuchKey" || e.$metadata?.httpStatusCode === 404) return "";
      throw e;
    }
  }
  try {
    const j = JSON.parse(await fs.readFile(ADMIN_FILE, "utf8"));
    return typeof j.secret === "string" ? j.secret : "";
  } catch { return ""; }
}

export async function setAdminSecret(secret) {
  const body = JSON.stringify({ secret: String(secret || "") });
  if (useR2) {
    await s3.send(new PutObjectCommand({
      Bucket: R2_BUCKET, Key: ADMIN_KEY, Body: body, ContentType: "application/json",
    }));
    return;
  }
  await fs.mkdir(path.dirname(ADMIN_FILE), { recursive: true });
  await fs.writeFile(ADMIN_FILE, body, "utf8");
}

/* ── imagens ── */
// Formatos aceitos e o ContentType com que o objeto é servido. Fixar a
// partir desta tabela (e não repassar o mime do cliente) impede que um
// upload seja entregue como text/html ou image/svg+xml pelo bucket.
const MIME_PERMITIDOS = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/avif",
]);

export async function saveImage(buffer, name, mime) {
  if (!MIME_PERMITIDOS.has(mime)) {
    throw new Error("Formato de imagem não permitido: " + mime);
  }
  // basename descarta qualquer "../" que tenha sobrevivido ao saneamento
  const filename = Date.now() + "-" + path.basename(name);
  if (useR2) {
    const key = "photos/" + filename;
    await s3.send(new PutObjectCommand({
      Bucket: R2_BUCKET, Key: key, Body: buffer,
      ContentType: mime,
      // Impede que o navegador reinterprete o objeto como outro tipo
      ContentDisposition: "inline",
    }));
    return R2_PUBLIC_BASE + "/" + key;
  }
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer);
  return PUBLIC_BASE + "/uploads/" + filename;
}

export async function deleteImage(url) {
  if (!url) return;
  if (useR2) {
    if (!url.startsWith(R2_PUBLIC_BASE + "/")) return;
    const key = url.slice(R2_PUBLIC_BASE.length + 1);
    // Só objetos sob photos/, e sem "..": senão a rota de excluir foto
    // apaga qualquer chave do bucket — inclusive o content.json, que é o
    // "banco" do site inteiro.
    if (!key.startsWith("photos/") || key.includes("..")) return;
    await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return;
  }
  const filename = url.split("/uploads/")[1];
  if (!filename) return;
  // basename impede que "../../algo" escape da pasta uploads
  await fs.unlink(path.join(UPLOAD_DIR, path.basename(filename))).catch(() => {});
}

/* ── normalização/saneamento estrutural ── */
function normalize(c) {
  c = c && typeof c === "object" ? c : {};
  const contact = c.contact && typeof c.contact === "object" ? c.contact : {};
  const photos = (arr, max) =>
    (Array.isArray(arr) ? arr : [])
      .filter((p) => p && typeof p.url === "string" && isSafeUrl(p.url))
      .slice(0, max)
      .map((p) => ({
        url: p.url,
        caption: String(p.caption || "").slice(0, 140),
        // enquadramento escolhido na área ADM (object-position); sem isto a
        // escolha do usuário era descartada no salvamento
        position: isSafePosition(p.position) ? p.position : "50% 50%",
      }));
  // serviços: objeto por id de serviço (1..6), até 2 fotos cada
  const svcSrc = (c.services && typeof c.services === "object" && !Array.isArray(c.services)) ? c.services : {};
  const services = {};
  for (let i = 1; i <= 6; i++) services[i] = photos(svcSrc[i], 2);
  return {
    contact: {
      whatsappLabel: str(contact.whatsappLabel, DEFAULT_CONTENT.contact.whatsappLabel, 40),
      whatsappNumber: String(contact.whatsappNumber || DEFAULT_CONTENT.contact.whatsappNumber)
        .replace(/[^0-9]/g, "").slice(0, 15),
      email: str(contact.email, DEFAULT_CONTENT.contact.email, 120),
      linkedin: str(contact.linkedin, DEFAULT_CONTENT.contact.linkedin, 200),
    },
    presentation: photos(c.presentation, 10),
    services,
  };
}
function str(v, fallback, max) {
  const s = String(v == null ? "" : v).trim();
  return (s || fallback).slice(0, max);
}
function isSafeUrl(u) {
  return /^https?:\/\//i.test(u) || u.startsWith("/uploads/");
}
// só "X% Y%" — evita injeção de CSS arbitrário via object-position
function isSafePosition(p) {
  return typeof p === "string" && /^\d{1,3}% \d{1,3}%$/.test(p);
}
