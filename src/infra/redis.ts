import "dotenv/config";
import { Redis, type RedisOptions } from "ioredis";

/**
 * Monta as opções de conexão do Redis a partir das variáveis de ambiente
 * com fallbacks seguros para desenvolvimento local.
 */
function createRedisClient(): Redis {
  if (process.env.REDIS_URL) {
    return new Redis(process.env.REDIS_URL);
  }

  const isTls = process.env.CORE_REDIS_TLS === "true";

  return new Redis({
    host: process.env.CORE_REDIS_HOST || "127.0.0.1",
    port: process.env.CORE_REDIS_PORT ? Number(process.env.CORE_REDIS_PORT) : 6379,
    username: process.env.CORE_REDIS_USER || undefined,
    password: process.env.CORE_REDIS_PASSWORD || undefined,
    db: process.env.CORE_REDIS_DB ? Number(process.env.CORE_REDIS_DB) : 0,
    commandTimeout: process.env.CORE_REDIS_TIMEOUT ? Number(process.env.CORE_REDIS_TIMEOUT) : 5000,
    connectTimeout: process.env.CORE_REDIS_CONNECT_TIMEOUT ? Number(process.env.CORE_REDIS_CONNECT_TIMEOUT) : 10000,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    ...(isTls ? { tls: {} } : {}),
  });
}

// Criação da instância singleton do Redis
export const redisClient = createRedisClient();

// Tratamento de eventos de conexão
redisClient.on("connect", () => {
  console.log("🔌 [Redis Infra] Conectado ao servidor Redis com sucesso.");
});

redisClient.on("ready", () => {
  console.log("⚡ [Redis Infra] Conexão pronta para receber comandos.");
});

redisClient.on("error", (error: Error) => {
  console.error("🔴 [Redis Infra] Erro na conexão do Redis:", error.message);
});

redisClient.on("close", () => {
  console.log("⚠️ [Redis Infra] Conexão do Redis fechada.");
});

/**
 * Função utilitária para encerramento gracioso da conexão
 */
export async function closeRedisConnection(): Promise<void> {
  try {
    if (redisClient.status !== "end") {
      await redisClient.quit();
      console.log("✅ [Redis Infra] Desconectado do Redis com sucesso.");
    }
  } catch (error) {
    console.error("🔴 [Redis Infra] Erro ao encerrar conexão do Redis:", error);
    redisClient.disconnect();
  }
}
