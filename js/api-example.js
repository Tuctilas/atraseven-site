import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

app.post("/api/diagnostic", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Campo 'message' é obrigatório." });
    }

    console.log("=== Mensagem recebida ===");
    console.log(message);
    console.log("========================");

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Você é um especialista técnico industrial da ATRA SEVEN.

Você analisa:
- redutores industriais
- acoplamentos
- vibração
- aquecimento
- ruído mecânico
- desgaste
- lubrificação
- falhas industriais

Mensagem do cliente:
${message}

Responda no formato:

1. Possível causa
2. Nível de urgência
3. Recomendação técnica`,
        },
      ],
    });

    const reply = response.content?.[0]?.text ?? "Sem resposta da IA.";

    console.log("=== Resposta da IA ===");
    console.log(reply);
    console.log("======================");

    res.json({ reply });
  } catch (error) {
    console.error("=== Erro na chamada Anthropic ===");
    console.error("Status HTTP:", error.status);
    console.error("Mensagem:", error.message);
    console.error("Detalhes:", error);
    console.error("=================================");

    res.status(500).json({ error: "Erro interno IA" });
  }
});

app.listen(3000, () => {
  console.log("=================================");
  console.log("IA ATRA SEVEN ONLINE");
  console.log("http://localhost:3000");
  console.log("=================================");
});
