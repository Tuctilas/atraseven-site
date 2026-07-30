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
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin) || LOCALHOST_RE.test(origin) || PAGES_RE.test(origin)) return callback(null, true);
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

function sanitize(value) {
  return String(value).replace(/[<>"']/g, "").trim();
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

app.post("/api/contact", contactLimiter, async (req, res) => {
  try {
    const { nome, empresa, telefone, email, setor, mensagem, website, consent } = req.body;

    // Honeypot: campo invisível que só bots preenchem. Respondemos 200 sem enviar nada.
    if (website) {
      return res.json({ ok: true });
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

    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });

      await transporter.sendMail({
        from: `"Site ATRA SEVEN" <${process.env.SMTP_USER}>`,
        to: process.env.CONTACT_EMAIL || "vendas@atraseven.com.br",
        subject: `Nova solicitação de orçamento — ${s.nome}`,
        text: `Nome: ${s.nome}\nEmpresa: ${s.empresa}\nTelefone: ${s.telefone}\nE-mail: ${s.email}\nSetor: ${s.setor}\n\nMensagem:\n${s.mensagem}`,
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("Erro no formulário de contato:", error.message);
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

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Muitas tentativas. Tente novamente em 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

// Sem hash configurado o acesso fica bloqueado (fail closed) — nunca há senha padrão.
async function checkPassword(pw) {
  if (!ADMIN_PASSWORD_HASH) {
    console.error("[ADM] ADMIN_PASSWORD_HASH não definido — acesso administrativo bloqueado.");
    return false;
  }
  return bcrypt.compare(pw, ADMIN_PASSWORD_HASH);
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
    const ok = email === ADMIN_EMAIL && (await checkPassword(password));
    if (!ok) return res.status(401).json({ error: "E-mail ou senha inválidos." });

    const token = jwt.sign({ sub: email, role: "admin" }, JWT_SECRET, { expiresIn: "8h" });
    res.json({ token });
  } catch (e) {
    console.error("Erro no login ADM:", e.message);
    res.status(500).json({ error: "Erro interno." });
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

app.listen(process.env.PORT || 3000, () => {
  console.log("ATRA SEVEN API online" + (store.useR2 ? " (R2)" : " (armazenamento local)"));
});
