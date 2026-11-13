import { type Request, type Response, type NextFunction } from "express";
import { type Redis } from "ioredis";
import { PANIC_CHANNEL } from "../constants/panic";
import { PanicService } from "../services/panicService";

// Estado em memória local desta instância (Fail-Closed: seguro por padrão)
let isPanicActive = true;
let subscriberClient: Redis | null = null;

/**
 * Inicializa o CONSUMIDOR do pânico para o microsserviço.
 * 
 * 1. Inicia bloqueado em memória (Fail-Closed).
 * 2. Assina o canal Pub/Sub para escutar alterações futuras.
 * 3. Faz uma leitura inicial (boot) via PanicService para sincronizar com o estado global.
 */
export async function setupPanicConsumer(redis: Redis, panicService?: PanicService): Promise<void> {
  const service = panicService ?? new PanicService(redis);

  // Duplica a conexão para uso exclusivo do Pub/Sub
  subscriberClient = redis.duplicate();

  subscriberClient.on("error", (err) => {
    console.error("⚠️ [Panic Consumer] Erro no subscriber do Redis:", err.message);
  });

  subscriberClient.on("message", (channel, message) => {
    if (channel === PANIC_CHANNEL) {
      const normalized = message.trim().toLowerCase();
      isPanicActive = normalized === "true" || normalized === "1";
      console.log(`📡 [Panic Consumer] Mensagem recebida via canal: PÂNICO = ${isPanicActive}`);
    }
  });

  // 1. Assina o canal
  await subscriberClient.subscribe(PANIC_CHANNEL);
  console.log(`📡 [Panic Consumer] Inscrito no canal: "${PANIC_CHANNEL}"`);

  // 2. Consulta de Boot: Sincroniza com o estado global persistido no Redis
  try {
    isPanicActive = await service.getGlobalStatus();
    console.log(`🔄 [Panic Consumer] Estado inicial sincronizado no Boot: ${isPanicActive ? "🚨 ATIVO" : "🟢 INATIVO"}`);
  } catch (error) {
    // Se o Redis falhar no boot, mantemos Fail-Closed (true)
    isPanicActive = true;
    console.error("⚠️ [Panic Consumer] Falha ao sincronizar boot com Redis. Mantendo PÂNICO ATIVO por segurança:", error);
  }
}

/**
 * Retorna o estado atual em memória desta instância (consulta em 0ms)
 */
export function getPanicLocalState(): boolean {
  return isPanicActive;
}

/**
 * Middleware Express para proteger rotas críticas.
 * Zero latência de rede: apenas checa a variável em memória.
 */
export function panicMiddleware(req: Request, res: Response, next: NextFunction) {
  if (isPanicActive) {
    return res.status(503).json({
      statusCode: 503,
      error: "Service Unavailable",
      message: "Este endpoint está temporariamente indisponível (botão de pânico ativo no cluster).",
      timestamp: new Date().toISOString(),
    });
  }

  next();
}
