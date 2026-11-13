import "dotenv/config";

const API_URL = process.env.API_URL || "http://localhost:3000";
const CHECKOUT_INTERVAL = 500; // ms entre requisições
const PANIC_TOGGLE_INTERVAL = 5000; // ms para alternar o pânico

let requestCount = 0;
let panicActive = false;

async function makeCheckoutRequest(): Promise<void> {
  try {
    requestCount++;
    const timestamp = new Date().toLocaleTimeString("pt-BR");
    
    const response = await fetch(`${API_URL}/checkout`);
    const status = response.status;
    const data = await response.json();
    
    if (status === 200) {
      console.log(`[${timestamp}] ✅ Req #${requestCount} | Status: 200 | OrderId: ${data.orderId}`);
    } else if (status === 503) {
      console.log(`[${timestamp}] 🛑 Req #${requestCount} | Status: 503 | Botão do pânico ATIVADO!`);
    } else {
      console.log(`[${timestamp}] ⚠️ Req #${requestCount} | Status: ${status}`);
    }
  } catch (error) {
    const timestamp = new Date().toLocaleTimeString("pt-BR");
    console.error(`[${timestamp}] ❌ Req #${requestCount} | Erro: ${(error as Error).message}`);
  }
}

async function togglePanicButton(): Promise<void> {
  try {
    panicActive = !panicActive;
    const timestamp = new Date().toLocaleTimeString("pt-BR");
    
    const response = await fetch(`${API_URL}/admin/panic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: panicActive }),
    });
    
    const data = await response.json();
    
    if (panicActive) {
      console.log(`\n[${timestamp}] 🚨 BOTÃO DO PÂNICO ATIVADO! Subscribers notificados: ${data.subscribersNotified}\n`);
    } else {
      console.log(`\n[${timestamp}] 🟢 BOTÃO DO PÂNICO DESATIVADO! Subscribers notificados: ${data.subscribersNotified}\n`);
    }
  } catch (error) {
    const timestamp = new Date().toLocaleTimeString("pt-BR");
    console.error(`[${timestamp}] ❌ Erro ao alternar pânico: ${(error as Error).message}`);
  }
}

async function main(): Promise<void> {
  console.log("🔄 Iniciando teste com loop de /checkout e toggle automático do pânico");
  console.log(`📍 API URL: ${API_URL}`);
  console.log(`⏱️ Intervalo de requisições: ${CHECKOUT_INTERVAL}ms`);
  console.log(`⏱️ Intervalo de toggle do pânico: ${PANIC_TOGGLE_INTERVAL}ms`);
  console.log("💡 Pressione Ctrl+C para parar\n");
  console.log("-------------------------------------------\n");

  // Loop de requisições
  setInterval(makeCheckoutRequest, CHECKOUT_INTERVAL);
  
  // Toggle do botão do pânico
  setInterval(togglePanicButton, PANIC_TOGGLE_INTERVAL);
  
  // Mantém o processo rodando
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("🔴 Erro fatal:", err);
  process.exit(1);
});
