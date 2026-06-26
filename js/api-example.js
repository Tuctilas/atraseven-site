import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
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
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin) || LOCALHOST_RE.test(origin)) return callback(null, true);
    callback(new Error("Origem não permitida pelo CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "100kb" }));

// Em modo local (sem Supabase), serve as fotos enviadas a partir da pasta uploads/
if (!store.useSupabase) {
  app.use("/uploads", express.static(store.UPLOAD_DIR));
}

const diagnosticLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Muitas solicitações. Tente novamente em 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "Muitas solicitações de contato. Tente novamente em 1 hora." },
  standardHeaders: true,
  legacyHeaders: false,
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DIAGNOSTIC_SYSTEM_PROMPT = `Você é um especialista técnico em redutores industriais e acoplamentos da empresa ATRA SEVEN.
Analise os dados do equipamento e gere um pré-diagnóstico técnico objetivo em português, com no máximo 200 palavras.
Responda SOMENTE com o diagnóstico técnico nos 3 blocos abaixo, sem saudações ou comentários extras.
Seja direto e técnico.`;

const FIELD_LIMITS = {
  tipo: 100, marca: 100, potencia: 50,
  relacao: 50, horas: 50, sintoma: 200, adicional: 500,
};

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

app.post("/api/diagnostic", diagnosticLimiter, async (req, res) => {
  try {
    const { tipo, marca, potencia, relacao, horas, sintoma, adicional } = req.body;

    if (!tipo || !sintoma) {
      return res.status(400).json({ error: "Campos 'tipo' e 'sintoma' são obrigatórios." });
    }

    const validationError = validateFields(req.body, FIELD_LIMITS);
    if (validationError) return res.status(400).json({ error: validationError });

    const s = {
      tipo:      sanitize(tipo),
      marca:     marca      ? sanitize(marca)      : "Não informado",
      potencia:  potencia   ? sanitize(potencia)   : "Não informada",
      relacao:   relacao    ? sanitize(relacao)     : "Não informada",
      horas:     horas      ? sanitize(horas)       : "Não informadas",
      sintoma:   sanitize(sintoma),
      adicional: adicional  ? sanitize(adicional)  : "Nenhuma",
    };

    // Prompt é construído inteiramente no backend — não aceita texto livre do cliente
    const userMessage = `Equipamento: ${s.tipo}
Marca/Fabricante: ${s.marca}
Potência: ${s.potencia}
Relação de redução: ${s.relacao}
Horas de operação: ${s.horas}
Sintoma principal: ${s.sintoma}
Informações adicionais: ${s.adicional}

Formate a resposta em 3 blocos curtos:
• POSSÍVEIS CAUSAS:
• IMPACTO OPERACIONAL:
• RECOMENDAÇÃO ATRA SEVEN:`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 512,
      system: DIAGNOSTIC_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const reply = response.content?.[0]?.text ?? "Sem resposta da IA.";
    res.json({ reply });
  } catch (error) {
    console.error("Erro na chamada Anthropic:", error.message);
    res.status(500).json({ error: "Erro interno IA" });
  }
});

app.post("/api/contact", contactLimiter, async (req, res) => {
  try {
    const { nome, empresa, telefone, email, setor, mensagem } = req.body;

    if (!nome || !mensagem) {
      return res.status(400).json({ error: "Nome e mensagem são obrigatórios." });
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
const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-secret-trocar-em-producao";

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Muitas tentativas. Tente novamente em 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

// códigos de uso único em memória: email -> { codeHash, expires, attempts }
const loginCodes = new Map();
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

async function checkPassword(pw) {
  if (ADMIN_PASSWORD_HASH) return bcrypt.compare(pw, ADMIN_PASSWORD_HASH);
  // DEV: sem hash configurado — aceita senha de desenvolvimento
  console.warn("[ADM] ADMIN_PASSWORD_HASH não definido — usando senha de DEV ('atra-dev').");
  return pw === (process.env.DEV_ADMIN_PASSWORD || "atra-dev");
}

async function sendCodeEmail(to, code) {
  const text =
    `Seu código de acesso à área administrativa da ATRA SEVEN é:\n\n${code}\n\n` +
    `Válido por 10 minutos. Se você não solicitou, ignore este e-mail.`;
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.sendMail({
        from: `"ATRA SEVEN" <${process.env.SMTP_USER}>`,
        to,
        subject: "Código de acesso — Área ADM ATRA SEVEN",
        text,
      });
      return;
    } catch (e) {
      console.error("[ADM] Falha ao enviar e-mail do código:", e.message);
    }
  }
  // Fallback (dev / SMTP indisponível): mostra o código no log do servidor
  console.log(`\n========================================\n[ADM] Código de acesso para ${to}: ${code}\n========================================\n`);
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

// passo 1: e-mail + senha -> envia código por e-mail
app.post("/api/admin/login", adminLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const password = String(req.body.password || "");
    const ok = email === ADMIN_EMAIL && (await checkPassword(password));
    if (!ok) return res.status(401).json({ error: "E-mail ou senha inválidos." });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    loginCodes.set(email, { codeHash: sha256(code), expires: Date.now() + 10 * 60 * 1000, attempts: 0 });
    await sendCodeEmail(ADMIN_EMAIL, code);
    res.json({ pending: true });
  } catch (e) {
    console.error("Erro no login ADM:", e.message);
    res.status(500).json({ error: "Erro interno." });
  }
});

// passo 2: código -> token JWT
app.post("/api/admin/verify", adminLimiter, (req, res) => {
  const email = String(req.body.email || "").toLowerCase().trim();
  const code = String(req.body.code || "").trim();
  const entry = loginCodes.get(email);
  if (!entry || Date.now() > entry.expires) {
    loginCodes.delete(email);
    return res.status(400).json({ error: "Código expirado. Faça login novamente." });
  }
  if (++entry.attempts > 5) {
    loginCodes.delete(email);
    return res.status(429).json({ error: "Muitas tentativas. Faça login novamente." });
  }
  if (sha256(code) !== entry.codeHash) {
    return res.status(401).json({ error: "Código inválido." });
  }
  loginCodes.delete(email);
  const token = jwt.sign({ sub: email, role: "admin" }, JWT_SECRET, { expiresIn: "8h" });
  res.json({ token });
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
  console.log("ATRA SEVEN API online" + (store.useSupabase ? " (Supabase)" : " (armazenamento local)"));
});
