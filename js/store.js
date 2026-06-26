/**
 * store.js | Camada de armazenamento do conteúdo editável do site.
 *
 * Em produção (Render): usa Supabase (tabela `site_content` + bucket de Storage)
 *   se SUPABASE_URL e SUPABASE_SERVICE_KEY estiverem definidos.
 * Em desenvolvimento: fallback local — data/content.json + pasta uploads/.
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
export const useSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
const BUCKET = process.env.SUPABASE_BUCKET || "site-photos";
// base pública das imagens locais (precisa ser absoluta: o site roda em outra porta)
const PUBLIC_BASE = process.env.PUBLIC_BASE || "http://localhost:" + (process.env.PORT || 3000);
export { UPLOAD_DIR };

let supabase = null;
if (useSupabase) {
  const { createClient } = await import("@supabase/supabase-js");
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

/* ── conteúdo (telefone, e-mail, fotos) ── */
export async function getContent() {
  if (useSupabase) {
    const { data, error } = await supabase
      .from("site_content").select("data").eq("id", 1).maybeSingle();
    if (error) throw error;
    return normalize(data?.data);
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
  if (useSupabase) {
    const { error } = await supabase
      .from("site_content").upsert({ id: 1, data, updated_at: new Date().toISOString() });
    if (error) throw error;
    return data;
  }
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  return data;
}

/* ── imagens ── */
export async function saveImage(buffer, name, mime) {
  const filename = Date.now() + "-" + name;
  if (useSupabase) {
    const { error } = await supabase.storage
      .from(BUCKET).upload("photos/" + filename, buffer, { contentType: mime, upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl("photos/" + filename);
    return data.publicUrl;
  }
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer);
  return PUBLIC_BASE + "/uploads/" + filename;
}

export async function deleteImage(url) {
  if (!url) return;
  if (useSupabase) {
    const marker = "/" + BUCKET + "/";
    const i = url.indexOf(marker);
    if (i === -1) return;
    const key = url.slice(i + marker.length);
    await supabase.storage.from(BUCKET).remove([key]);
    return;
  }
  const filename = url.split("/uploads/")[1];
  if (!filename) return;
  await fs.unlink(path.join(UPLOAD_DIR, filename)).catch(() => {});
}

/* ── normalização/saneamento estrutural ── */
function normalize(c) {
  c = c && typeof c === "object" ? c : {};
  const contact = c.contact && typeof c.contact === "object" ? c.contact : {};
  const photos = (arr, max) =>
    (Array.isArray(arr) ? arr : [])
      .filter((p) => p && typeof p.url === "string" && isSafeUrl(p.url))
      .slice(0, max)
      .map((p) => ({ url: p.url, caption: String(p.caption || "").slice(0, 140) }));
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
