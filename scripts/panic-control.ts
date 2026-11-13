import "dotenv/config";

const API_URL = process.env.API_URL || "http://localhost:3000";
const action = process.argv[2];

async function checkPanicStatus(): Promise<void> {
  try {
    const response = await fetch(`${API_URL}/admin/panic`);
    const data = await response.json();
    
    console.log("\n📊 Estado do Botão do Pânico:");
    console.log(`   Local: ${data.localPanicState ? "🛑 ATIVADO" : "🟢 DESATIVADO"}`);
    console.log(`   Global (Redis): ${data.globalPanicState ? "🛑 ATIVADO" : "🟢 DESATIVADO"}`);
    console.log(`   Timestamp: ${data.timestamp}`);
    console.log();
  } catch (error) {
    console.error("❌ Erro ao consultar estado:", (error as Error).message);
    process.exit(1);
  }
}

async function togglePanic(active: boolean): Promise<void> {
  try {
    const response = await fetch(`${API_URL}/admin/panic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log(`\n${data.message}`);
      console.log(`Subscribers notificados: ${data.subscribersNotified}`);
      console.log(`Timestamp: ${data.timestamp}\n`);
    } else {
      console.error("❌ Erro:", data.error);
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Erro ao alternar pânico:", (error as Error).message);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  if (!action || !["on", "off", "status"].includes(action)) {
    console.log("\n🚨 Controle Manual do Botão do Pânico");
    console.log("=====================================\n");
    console.log("Uso: npx ts-node scripts/panic-control.ts <ação>\n");
    console.log("Ações disponíveis:");
    console.log("  • on      - Ativa o botão do pânico");
    console.log("  • off     - Desativa o botão do pânico");
    console.log("  • status  - Consulta o estado atual\n");
    console.log("Exemplos:");
    console.log("  npx ts-node scripts/panic-control.ts status");
    console.log("  npx ts-node scripts/panic-control.ts on");
    console.log("  npx ts-node scripts/panic-control.ts off\n");
    process.exit(0);
  }

  if (action === "status") {
    await checkPanicStatus();
  } else if (action === "on") {
    console.log("🚨 Ativando o botão do pânico...");
    await togglePanic(true);
    await checkPanicStatus();
  } else if (action === "off") {
    console.log("🟢 Desativando o botão do pânico...");
    await togglePanic(false);
    await checkPanicStatus();
  }
}

main().catch((err) => {
  console.error("🔴 Erro fatal:", err);
  process.exit(1);
});
