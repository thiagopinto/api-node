import "dotenv/config";

const API_URL = process.env.API_URL || "http://localhost:3000";
const action = process.argv[2] ?? "true";

async function main() {
  const active = action === "true" || action === "on" || action === "1";
  
  console.log(`📡 Enviando requisição para ${API_URL}/admin/panic (active: ${active})...`);
  
  try {
    const response = await fetch(`${API_URL}/admin/panic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log(`✅ ${data.message}`);
      console.log(`✅ Subscribers notificados: ${data.subscribersNotified}`);
    } else {
      console.error(`❌ Erro: ${data.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Erro ao publicar:", (error as Error).message);
    process.exit(1);
  }
  
  process.exit(0);
}

main();
