import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import multer from "multer";
import crypto from "crypto";
import * as store from "./store.js";

dotenv.config();

const app = express();

// Não anunciar "X-Powered-By: Express" — dá de graça a um atacante a pilha
// e a versão para casar com CVEs conhecidas.
app.disable("x-powered-by");

// Atrás do proxy do Render: sem isto, req.ip é o IP interno do proxy — o
// MESMO para todos os visitantes — e os rate limits viram um balde único
// global (5 contatos/hora para o site inteiro; qualquer um tranca o login
// do ADM). O valor 1 confia em exatamente um salto de proxy, o do Render.
app.set("trust proxy", 1);

const ALLOWED_ORIGINS = [
  process.env.ALLOWED_ORIGIN || "https://atraseven.com.br",
  "https://www.atraseven.com.br",
  "http://localhost:8000",
  "http://localhost:3000",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
];

const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
// Qualquer subdomínio do projeto no Cloudflare Pages (atraseven-site.pages.dev e previews)
const PAGES_RE = /^https:\/\/([a-z0-9-]+\.)?atraseven-site\.pages\.dev$/;
// Cloudflare Workers Static Assets — produção e previews do worker atraseven-site
const WORKERS_RE = /^https:\/\/([a-z0-9-]+-)?atraseven-site\.studiodiamondstudio-diamondstudiodiamond-appstudiodiamondbr\.workers\.dev$/;
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin) || LOCALHOST_RE.test(origin) || PAGES_RE.test(origin) || WORKERS_RE.test(origin)) return callback(null, true);
    callback(new Error("Origem não permitida pelo CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "100kb" }));

// Em modo local (sem R2), serve as fotos enviadas a partir da pasta uploads/
if (!store.useR2) {
  app.use("/uploads", express.static(store.UPLOAD_DIR));
}

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "Muitas solicitações de contato. Tente novamente em 1 hora." },
  standardHeaders: true,
  legacyHeaders: false,
});

const CONTACT_LIMITS = {
  nome: 100, empresa: 100, telefone: 20,
  email: 100, setor: 50, mensagem: 2000,
};

// Remove <>"' e caracteres de controle (CR incluso), preservando \n — a
// mensagem é multilinha. O \r fora impede injeção de cabeçalho SMTP caso
// algum campo pare num header de e-mail.
function sanitize(value) {
  return String(value).replace(/[<>"'\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim();
}

function validateFields(body, limits) {
  for (const [key, max] of Object.entries(limits)) {
    const val = body[key];
    if (val && String(val).length > max) {
      return `Campo '${key}' excede o limite de ${max} caracteres.`;
    }
  }
  return null;
}

const DESTINO_CONTATO = process.env.CONTACT_EMAIL || "vendas@atraseven.com.br";

// ── Cloudflare Turnstile (anti-bot no formulário) ──
// A validação roda AQUI, na API que já controlamos, e não num Worker à
// parte. A secret fica só no ambiente (TURNSTILE_SECRET no Render); o
// sitekey é público e vai no front. Sem a secret, a checagem é pulada
// (fail-open) para não travar o form em desenvolvimento nem durante a
// virada — mas grita no startup em produção, para a proteção nunca ficar
// desligada em silêncio, como aconteceu antes com o SMTP.
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET || "";
if (!TURNSTILE_SECRET && process.env.NODE_ENV === "production") {
  console.error("[turnstile] TURNSTILE_SECRET não definido — o formulário " +
    "de contato está SEM proteção anti-bot. Defina no Render.");
}

async function turnstileOk(token, ip) {
  if (!TURNSTILE_SECRET) return true;   // não configurado → não bloqueia
  if (!token) return false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: TURNSTILE_SECRET, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await r.json().catch(() => ({}));
    return data.success === true;
  } catch {
    return false;   // erro de rede na validação → rejeita (fail-closed)
  }
}

/**
 * Envia a solicitação do formulário por HTTP (Resend) ou, na falta dele,
 * por SMTP.
 *
 * A ordem não é preferência estética: a saída SMTP é BLOQUEADA na rede do
 * Render — a conexão com mail.atraseven.com.br fica pendurada até o proxy
 * devolver 502. Por isso produção usa Resend, e o SMTP fica só como
 * caminho de desenvolvimento local.
 *
 * Lança em caso de falha: quem chama devolve 500 e o visitante vê o erro,
 * em vez de receber "enviado com sucesso" com a mensagem no lixo.
 */
async function enviarSolicitacao(s) {
  const assunto = `Nova solicitação de orçamento — ${s.nome}`;
  const corpo =
    `Nome: ${s.nome}\nEmpresa: ${s.empresa}\nTelefone: ${s.telefone}\n` +
    `E-mail: ${s.email}\nSetor: ${s.setor}\n\nMensagem:\n${s.mensagem}`;

  if (process.env.RESEND_API_KEY) {
    // O remetente precisa ser do domínio verificado no Resend (um
    // subdomínio de envio), não o e-mail do visitante — senão SPF/DKIM
    // falham e a mensagem cai no spam. O visitante entra no reply_to,
    // então responder no cliente de e-mail já vai para ele.
    const remetente = process.env.RESEND_FROM || "Site ATRA SEVEN <site@envio.atraseven.com.br>";
    const respostaPara = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email) ? s.email : undefined;

    // RESEND_API_BASE existe para os testes apontarem a um servidor local
    // e conferirem o payload sem enviar e-mail de verdade. Em produção
    // fica indefinido e vale o endereço oficial.
    const base = process.env.RESEND_API_BASE || "https://api.resend.com";
    const r = await fetch(base + "/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.RESEND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: remetente,
        to: [DESTINO_CONTATO],
        subject: assunto,
        text: corpo,
        ...(respostaPara ? { reply_to: respostaPara } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!r.ok) {
      const detalhe = await r.text().catch(() => "");
      throw new Error(`Resend respondeu ${r.status}: ${detalhe.slice(0, 300)}`);
    }
    return;
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const porta = parseInt(process.env.SMTP_PORT || "587");
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: porta,
      secure: porta === 465,
      // Aborta se o servidor não oferecer STARTTLS, em vez de seguir em
      // claro — senão a senha SMTP viaja legível na rede.
      requireTLS: true,
      // Sem estes limites o sendMail fica pendurado indefinidamente quando
      // a saída SMTP está bloqueada, e o visitante espera na tela até o
      // navegador desistir. Melhor falhar rápido e alto.
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transporter.sendMail({
      from: `"Site ATRA SEVEN" <${process.env.SMTP_USER}>`,
      to: DESTINO_CONTATO,
      subject: assunto,
      text: corpo,
      ...(s.email !== "Não informado" ? { replyTo: s.email } : {}),
    });
    return;
  }

  throw new Error("Nenhum meio de envio configurado (defina RESEND_API_KEY).");
}

app.post("/api/contact", contactLimiter, async (req, res) => {
  try {
    const { nome, empresa, telefone, email, setor, mensagem, website, consent } = req.body;

    // Honeypot: campo invisível que só bots preenchem. Respondemos 200 sem enviar nada.
    if (website) {
      return res.json({ ok: true });
    }

    // Turnstile: barra robôs antes de qualquer trabalho. Ao contrário do
    // rate limit (por instância), atua na borda da Cloudflare e independe
    // de quantas instâncias o Render roda.
    if (!(await turnstileOk(req.body["cf-turnstile-response"], req.ip))) {
      return res.status(403).json({ error: "Verificação anti-robô falhou. Recarregue a página e tente novamente." });
    }

    if (!nome || !mensagem) {
      return res.status(400).json({ error: "Nome e mensagem são obrigatórios." });
    }

    if (!consent) {
      return res.status(400).json({ error: "É necessário consentir com o tratamento dos dados." });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      return res.status(400).json({ error: "E-mail inválido." });
    }

    const validationError = validateFields(req.body, CONTACT_LIMITS);
    if (validationError) return res.status(400).json({ error: validationError });

    const s = {
      nome:      sanitize(nome),
      empresa:   empresa   ? sanitize(empresa)   : "Não informado",
      telefone:  telefone  ? sanitize(telefone)  : "Não informado",
      email:     email     ? sanitize(email)     : "Não informado",
      setor:     setor     ? sanitize(setor)     : "Não informado",
      mensagem:  sanitize(mensagem),
    };

    await enviarSolicitacao(s);

    res.json({ ok: true });
  } catch (error) {
    // NÃO registra os dados do visitante (nome, e-mail, telefone). A
    // solicitação de orçamento existe só para virar e-mail e não deve
    // ficar guardada em lugar nenhum — nem nos logs do Render. Registra
    // apenas QUE falhou e por quê, para diagnosticar o SMTP/Resend. O
    // visitante já recebe erro na tela e tem o botão do WhatsApp como
    // alternativa, então nenhum contato fica preso aqui.
    console.error("[contato] falha no envio (sem dados pessoais):", error.message);
    res.status(500).json({ error: "Erro ao enviar solicitação." });
  }
});

/* ════════════════════════════════════════════════════════════
   ÁREA ADM — conteúdo editável, autenticação e upload de fotos
   ════════════════════════════════════════════════════════════ */

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || process.env.CONTACT_EMAIL || "vendas@atraseven.com.br")
  .toLowerCase().trim();
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || "";

// Sem JWT_SECRET no ambiente, usa um segredo aleatório desta execução: as sessões
// caem a cada restart, mas nunca há um segredo previsível/público assinando tokens.
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.JWT_SECRET) {
  console.warn("[ADM] JWT_SECRET não definido — usando segredo aleatório desta execução. Defina JWT_SECRET no ambiente.");
}

/* ── senha do admin: hash efetivo + cifragem do hash salvo ──
   A senha pode ser trocada pela área ADM (POST /api/admin/password). O novo
   hash bcrypt é persistido pelo store, mas CIFRADO com AES-GCM: assim ele
   nunca vaza, mesmo que o objeto do bucket seja lido. A chave deriva do
   JWT_SECRET (que já precisa ser estável em produção) — se o JWT_SECRET
   mudar, o hash salvo deixa de decifrar e o login cai no ADMIN_PASSWORD_HASH
   do ambiente. Por isso a troca de senha SÓ persiste se JWT_SECRET estiver
   definido no Render. */
const ADMIN_ENC_KEY = crypto.createHash("sha256").update("atra-admin-hash:" + JWT_SECRET).digest();

function encryptHash(hash) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", ADMIN_ENC_KEY, iv);
  const ct = Buffer.concat([c.update(String(hash), "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), ct.toString("base64")].join(".");
}
function decryptHash(blob) {
  try {
    const [ivB, tagB, ctB] = String(blob).split(".");
    if (!ivB || !tagB || !ctB) return "";
    const d = crypto.createDecipheriv("aes-256-gcm", ADMIN_ENC_KEY, Buffer.from(ivB, "base64"));
    d.setAuthTag(Buffer.from(tagB, "base64"));
    return Buffer.concat([d.update(Buffer.from(ctB, "base64")), d.final()]).toString("utf8");
  } catch { return ""; }
}

// Hash em vigor: o salvo pela área ADM tem prioridade; na falta, o do
// ambiente. Cacheado por 10s para não consultar o store a cada login.
let hashCache = { value: null, at: 0 };
async function effectiveHash() {
  const now = Date.now();
  if (hashCache.value !== null && now - hashCache.at < 10000) return hashCache.value;
  let stored = "";
  try { stored = decryptHash(await store.getAdminSecret()); } catch { /* store fora do ar → env */ }
  const h = stored || ADMIN_PASSWORD_HASH;
  hashCache = { value: h, at: now };
  return h;
}

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Muitas tentativas. Tente novamente em 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Lista de permissão de formatos raster. NÃO usar /^image\//: isso aceita
// image/svg+xml, e SVG carrega <script> — vira XSS armazenado servido pelo
// domínio público do bucket. O mimetype vem do cliente, então isto é só a
// primeira barreira; a segunda é o ContentType fixo no store.
const MIME_IMAGENS = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/avif",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }, // 5 MB
  fileFilter: (req, file, cb) => cb(null, MIME_IMAGENS.has(file.mimetype)),
});

// Hash descartável usado só para gastar o mesmo tempo de bcrypt quando o
// e-mail não confere. Sem isto, e-mail errado responde em ~0,25s e e-mail
// certo em ~1s, e a diferença entrega qual é a conta do admin.
const HASH_DUMMY = bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), 10);

// Sem hash configurado o acesso fica bloqueado (fail closed) — nunca há senha padrão.
async function checkPassword(pw) {
  const hash = await effectiveHash();
  if (!hash) {
    console.error("[ADM] Sem senha configurada (nem salva nem em ADMIN_PASSWORD_HASH) — acesso administrativo bloqueado.");
    await bcrypt.compare(pw, HASH_DUMMY);
    return false;
  }
  return bcrypt.compare(pw, hash);
}

function requireAuth(req, res, next) {
  const m = (req.headers.authorization || "").match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ error: "Não autenticado." });
  try {
    req.admin = jwt.verify(m[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Sessão expirada. Entre novamente." });
  }
}

// e-mail + senha -> token JWT
app.post("/api/admin/login", adminLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const password = String(req.body.password || "");
    // Sem curto-circuito: bcrypt roda mesmo com e-mail errado (contra o
    // hash descartável), para que as duas respostas levem o mesmo tempo.
    const senhaOk = email === ADMIN_EMAIL
      ? await checkPassword(password)
      : (await bcrypt.compare(password, HASH_DUMMY), false);
    if (!senhaOk) return res.status(401).json({ error: "E-mail ou senha inválidos." });

    const token = jwt.sign({ sub: email, role: "admin" }, JWT_SECRET, { expiresIn: "8h" });
    res.json({ token });
  } catch (e) {
    console.error("Erro no login ADM:", e.message);
    res.status(500).json({ error: "Erro interno." });
  }
});

// alterar a senha do admin (autenticado + confirma a senha atual)
app.post("/api/admin/password", requireAuth, async (req, res) => {
  try {
    const current = String(req.body.currentPassword || "");
    const next = String(req.body.newPassword || "");
    if (next.length < 10) return res.status(400).json({ error: "A nova senha precisa ter ao menos 10 caracteres." });
    if (next.length > 200) return res.status(400).json({ error: "Senha muito longa." });
    // "atual" na mensagem: o front distingue disto uma sessão expirada (401 do requireAuth).
    if (!(await checkPassword(current))) return res.status(401).json({ error: "Senha atual incorreta." });
    if (!process.env.JWT_SECRET) {
      // Sem JWT_SECRET fixo, a chave de cifragem muda a cada restart e a nova
      // senha se perderia silenciosamente. Melhor recusar e avisar.
      return res.status(503).json({ error: "Defina JWT_SECRET no servidor antes de trocar a senha (senão a mudança não persiste)." });
    }
    const hash = await bcrypt.hash(next, 12);
    await store.setAdminSecret(encryptHash(hash));
    hashCache = { value: hash, at: Date.now() };
    res.json({ ok: true });
  } catch (e) {
    console.error("Erro ao alterar senha ADM:", e.message);
    res.status(500).json({ error: "Erro ao alterar a senha." });
  }
});

// conteúdo público
app.get("/api/content", async (req, res) => {
  try {
    res.json(await store.getContent());
  } catch (e) {
    console.error("Erro ao carregar conteúdo:", e.message);
    res.status(500).json({ error: "Erro ao carregar conteúdo." });
  }
});

// salvar conteúdo (autenticado) — o store normaliza/sanea a estrutura
app.put("/api/admin/content", requireAuth, async (req, res) => {
  try {
    const saved = await store.saveContent(req.body || {});
    res.json({ ok: true, content: saved });
  } catch (e) {
    console.error("Erro ao salvar conteúdo:", e.message);
    res.status(500).json({ error: "Erro ao salvar." });
  }
});

// upload de foto (autenticado)
app.post("/api/admin/upload", requireAuth, upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Envie uma imagem (campo 'photo')." });
    const safe = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60) || "foto.jpg";
    const url = await store.saveImage(req.file.buffer, safe, req.file.mimetype);
    res.json({ url });
  } catch (e) {
    console.error("Erro no upload:", e.message);
    res.status(500).json({ error: "Erro ao enviar a imagem." });
  }
});

// excluir foto (autenticado)
app.delete("/api/admin/photo", requireAuth, async (req, res) => {
  try {
    await store.deleteImage(String(req.body.url || ""));
    res.json({ ok: true });
  } catch (e) {
    console.error("Erro ao excluir foto:", e.message);
    res.status(500).json({ error: "Erro ao excluir a imagem." });
  }
});

// 404 em JSON — sem isto o Express responde com a página HTML "Cannot GET",
// que anuncia o framework e destoa de uma API JSON.
app.use((req, res) => {
  res.status(404).json({ error: "Recurso não encontrado." });
});

// Handler de erro final. Uniformiza qualquer exceção (inclusive a rejeição
// do CORS, que antes virava um 500 com HTML de stack) numa resposta JSON
// enxuta, sem vazar mensagem interna nem stack trace ao cliente.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const corsBloqueado = err && /CORS/i.test(err.message || "");
  if (!corsBloqueado) console.error("Erro não tratado:", err.message);
  res.status(corsBloqueado ? 403 : 500)
    .json({ error: corsBloqueado ? "Origem não permitida." : "Erro interno." });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("ATRA SEVEN API online" + (store.useR2 ? " (R2)" : " (armazenamento local)"));
});
