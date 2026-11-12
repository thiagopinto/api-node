import "dotenv/config";
import { redisClient } from "../src/infra/redis";

const message = process.argv[2] ?? "true";
const channel = "channel_panic";

async function main() {
  console.log(`📡 Publicando no canal Redis "${channel}": "${message}"...`);
  const receivers = await redisClient.publish(channel, message);
  console.log(`✅ Mensagem entregue para ${receivers} assinante(s)!`);
  await redisClient.quit();
  process.exit(0);
}

main().catch((err) => {
  console.error("🔴 Erro ao publicar mensagem:", err);
  process.exit(1);
});
