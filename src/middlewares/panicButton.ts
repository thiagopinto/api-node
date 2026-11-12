import { type Request, type Response, type NextFunction } from "express";
import { type Redis } from "ioredis";

// Estado em memória local (consulta imediata em 0ms)
let isPanicActive = false;
let subscriberClient: Redis | null = null;

export const PANIC_CHANNEL = "channel_panic";
export const PANIC_REDIS_KEY = "panic:global_state";

/**
 * Inicializa a escuta no Redis e sincroniza o estado global na inicialização
 */
export async function setupPanicButton(redis: Redis, useDuplicate: boolean = true) {
  subscriberClient = useDuplicate ? redis.duplicate() : redis;

  subscriberClient.on("error", (err) => {
    console.error("⚠️ Redis subscriber error: ", err);
  });

  // 1. Ouve os eventos em tempo real para todos os microserviços
  subscriberClient.on("message", (channel, message) => {
    if (channel === PANIC_CHANNEL) {
      const normalizedMessage = message.trim().toLowerCase();
      if (normalizedMessage === "true" || normalizedMessage === "1") {
        isPanicActive = true;
        console.log(`🚨 [PÂNICO ATIVADO] Endpoints protegidos responderão 503.`);
      } else if (normalizedMessage === "false" || normalizedMessage === "0") {
        isPanicActive = false;
        console.log(`🟢 [PÂNICO DESATIVADO] Endpoints protegidos voltaram ao normal.`);
      } else {
        console.warn(`Mensagem desconhecida no canal de pânico: ${message}`);
      }
    }
  });

  await subscriberClient.subscribe(PANIC_CHANNEL);
  console.log(`📡 Inscrito no canal Pub/Sub: "${PANIC_CHANNEL}"`);

  // 2. Sincronização inicial: lê a chave persistida no Redis
  // Caso o pânico já tenha sido acionado antes deste microserviço iniciar
  try {
    const currentState = await redis.get(PANIC_REDIS_KEY);
    if (currentState === "true" || currentState === "1") {
      isPanicActive = true;
      console.log(`⚠️ Estado global recuperado do Redis: PÂNICO ATIVO`);
    } else {
      isPanicActive = false;
      console.log(`✅ Estado global recuperado do Redis: PÂNICO INATIVO`);
    }
  } catch (error) {
    console.error("Erro ao sincronizar estado inicial do pânico do Redis:", error);
  }
}

/**
 * Retorna o estado em memória local deste microserviço
 */
export function getPanicState(): boolean {
  return isPanicActive;
}

/**
 * Consulta a fonte da verdade global persistida no Redis
 */
export async function getGlobalPanicState(redis: Redis): Promise<boolean> {
  const state = await redis.get(PANIC_REDIS_KEY);
  return state === "true" || state === "1";
}

/**
 * Altera o estado global no Redis e notifica TODOS os microserviços via Pub/Sub
 * @returns Quantidade de microserviços (subscribers) que receberam o aviso em tempo real
 */
export async function setGlobalPanicState(redis: Redis, active: boolean): Promise<number> {
  const value = active ? "true" : "false";

  // 1. Persiste a chave para novos microserviços que iniciarem no futuro
  await redis.set(PANIC_REDIS_KEY, value);

  // 2. Dispara o evento Pub/Sub para todos os microserviços atualmente rodando
  const subscribersNotified = await redis.publish(PANIC_CHANNEL, value);

  // 3. Atualiza o estado da própria instância
  isPanicActive = active;

  return subscribersNotified;
}

/**
 * Middleware para bloquear endpoints quando o pânico estiver ativo
 */
export function panicMiddleware(req: Request, res: Response, next: NextFunction) {
  if (isPanicActive) {
    return res.status(503).json({ 
      statusCode: 503,
      error: "Service Unavailable",
      message: "Este endpoint está temporariamente indisponível (botão de pânico ativo).",
      timestamp: new Date().toISOString()
    });
  }
  next();
}
