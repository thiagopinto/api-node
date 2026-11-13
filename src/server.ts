import express, { type Request, type Response } from "express";
import {
  inFlightMiddleware,
  setupGracefulShutdown,
  getInFlightCount,
} from "./middlewares/inFlight";
import { redisClient } from "./infra/redis";
import { PanicService } from "./services/panicService";
import {
  setupPanicConsumer,
  panicMiddleware,
  getPanicLocalState,
} from "./middlewares/panicMiddleware";

const app = express();
const PORT = process.env.PORT || 3000;

// Instância do Service de Gestão do Pânico
const panicService = new PanicService(redisClient);

// Middlewares globais
app.use(express.json());
app.use(inFlightMiddleware);

// ==========================================
// 1. ROTAS GERAIS / HEALTHCHECK
// ==========================================
app.get("/", (req: Request, res: Response) => {
  res.json({
    message: "API Node.js com Express e TypeScript está ATIVA!",
    inFlightRequests: getInFlightCount(),
    localPanicState: getPanicLocalState(),
    timestamp: new Date().toISOString(),
  });
});

app.get("/slow", async (req: Request, res: Response) => {
  console.log("👉 Requisição /slow recebida. Processando por 5 segundos...");
  await new Promise((resolve) => setTimeout(resolve, 5000));
  console.log("✅ Requisição /slow concluída!");
  res.json({ message: "Processamento lento finalizado com sucesso!" });
});

// ==========================================
// 2. ROTA PROTEGIDA (CONSUMIDOR DO PÂNICO)
// ==========================================
app.get("/checkout", panicMiddleware, (req: Request, res: Response) => {
  res.json({
    message: "Transação de checkout concluída com sucesso!",
    orderId: Math.floor(Math.random() * 1000000),
  });
});

// ==========================================
// 3. ROTAS DE GESTÃO (CONTROL PLANE)
// ==========================================

// Consulta o status (local da instância e global do cluster via PanicService)
app.get("/admin/panic", async (req: Request, res: Response) => {
  try {
    const globalState = await panicService.getGlobalStatus();
    res.json({
      localPanicState: getPanicLocalState(),
      globalPanicState: globalState,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: "Erro ao consultar status global no Redis" });
  }
});

// Ativa ou Desativa o pânico de forma ATÔMICA via PanicService
app.post("/admin/panic", async (req: Request, res: Response) => {
  const { active } = req.body;
  if (typeof active !== "boolean") {
    return res.status(400).json({
      error: "Bad Request",
      message: "Envie um corpo JSON com { \"active\": true } ou { \"active\": false }",
    });
  }

  try {
    const result = await panicService.setGlobalStatus(active);
    res.json({
      success: true,
      panicActive: result.active,
      subscribersNotified: result.subscribersNotified,
      message: result.active
        ? "🚨 Pânico ATIVADO atomicamente no Redis e publicado para os microsserviços!"
        : "🟢 Pânico DESATIVADO atomicamente no Redis e publicado para os microsserviços!",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    res.status(500).json({ error: "Falha na transação atômica do pânico", details: msg });
  }
});

// ==========================================
// BOOTSTRAP ORQUESTRADO
// ==========================================
async function bootstrap() {
  try {
    // 1. O Consumidor sincroniza o Boot com o Redis antes de abrir as portas
    await setupPanicConsumer(redisClient, panicService);
  } catch (err) {
    console.error("Falha ao inicializar o consumidor do pânico:", err);
  }

  // 2. Somente após a sincronização, o servidor HTTP começa a aceitar tráfego
  const server = app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  });

  // 3. Graceful shutdown com monitoramento de requisições em voo
  setupGracefulShutdown(server);
}

bootstrap();
