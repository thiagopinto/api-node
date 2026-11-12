#!/usr/bin/env bash

TOTAL=${1:-10}

echo "============================================================"
echo "🚀 Disparando $TOTAL requisições simultâneas em /slow..."
echo "============================================================"

for i in $(seq 1 $TOTAL); do
  (
    RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" http://localhost:3000/slow)
    STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d':' -f2)
    echo "  [Req #$i] Finalizada com status HTTP $STATUS"
  ) &
done

echo ""
echo "⏳ Todas as $TOTAL requisições foram enviadas e estão 'em voo'!"
echo "👉 DICA: Vá agora no terminal da API e dê Ctrl+C para ver o Graceful Shutdown!"
echo ""

wait
echo "============================================================"
echo "🎉 Todas as $TOTAL requisições foram concluídas pelo servidor!"
echo "============================================================"
