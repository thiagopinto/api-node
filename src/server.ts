import express, { type Request, type Response } from "express";
import {
  inFlightMiddleware,
  setupGracefulShutdown,
  getInFlightCount,
} from "./middlewares/inFlight";
import { redisClient } from "./infra/redis";
import {
  setupPanicButton,
  panicMiddleware,
  getPanicState,
  getGlobalPanicState,
  setGlobalPanicState,
} from "./middlewares/panicButton";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware session
app.use(express.json()); // Enable JSON body parsing
app.use(inFlightMiddleware);

// Router session

// 1. Rota raiz / healthcheck público (sempre responde)
app.get("/", (req: Request, res: Response) => {
  res.json({
    message: "API Node.js com Express e TypeScript está ATIVA!",
    inFlightRequests: getInFlightCount(),
    panicModeActive: getPanicState(),
    timestamp: new Date().toISOString(),
  });
});

// 2. Rota de teste lenta (para testes de graceful shutdown)
app.get("/slow", async (req: Request, res: Response) => {
  console.log("👉 Requisição /slow recebida. Processando por 5 segundos...");
  await new Promise((resolve) => setTimeout(resolve, 5000));
  console.log("✅ Requisição /slow concluída!");
  res.json({ message: "Processamento lento finalizado com sucesso!" });
});

// 3. Rota crítica protegida pelo BOTÃO DO PÂNICO
app.get("/checkout", panicMiddleware, (req: Request, res: Response) => {
  res.json({
    message: "Transação de checkout concluída com sucesso!",
    orderId: Math.floor(Math.random() * 1000000),
  });
});

// ==========================================
// PAINEL ADMINISTRATIVO DO BOTÃO DO PÂNICO
// ==========================================

// Consulta o status do pânico (local desta instância e global no Redis)
app.get("/admin/panic", async (req: Request, res: Response) => {
  try {
    const globalState = await getGlobalPanicState(redisClient);
    res.json({
      localPanicState: getPanicState(),
      globalPanicState: globalState,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: "Erro ao consultar estado global do Redis" });
  }
});

// Ativa ou desativa o pânico globalmente para TODOS os microserviços
app.post("/admin/panic", async (req: Request, res: Response) => {
  const { active } = req.body;
  if (typeof active !== "boolean") {
    return res.status(400).json({
      error: "Bad Request",
      message: "Envie um JSON com { \"active\": true } ou { \"active\": false }",
    });
  }

  try {
    const subscribersNotified = await setGlobalPanicState(redisClient, active);
    res.json({
      success: true,
      panicActive: active,
      subscribersNotified,
      message: active
        ? "🚨 Botão de pânico ATIVADO para todos os microserviços!"
        : "🟢 Botão de pânico DESATIVADO para todos os microserviços!",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: "Erro ao atualizar estado de pânico no Redis" });
  }
});

// Start session
const server = app.listen(PORT, async () => {
  console.log(`🚀 Service start in http://localhost:${PORT}`);
  try {
    await setupPanicButton(redisClient);
  } catch (err) {
    console.error("Falha ao inicializar subscriber do pânico:", err);
  }
});

setupGracefulShutdown(server);
