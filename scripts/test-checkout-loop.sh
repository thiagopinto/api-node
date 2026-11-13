#!/usr/bin/env bash

echo "🔄 Loop contínuo no /checkout iniciado. Pressione Ctrl+C NESTE terminal para parar o teste."
echo "-------------------------------------------------------------------------"
echo "💡 Enquanto isso, ative o botão do pânico em outro terminal com:"
echo "   curl -X POST http://localhost:3000/admin/panic -H 'Content-Type: application/json' -d '{\"active\": true}'"
echo "-------------------------------------------------------------------------"

REQUEST_COUNT=0

while true; do
  HORA=$(date +'%H:%M:%S')
  ((REQUEST_COUNT++))
  
  # Faz a requisição capturando o código de status HTTP e a resposta
  RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" http://localhost:3000/checkout 2>/dev/null)
  HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d':' -f2)
  BODY=$(echo "$RESPONSE" | grep -v "HTTP_STATUS")
  
  if [ "$HTTP_CODE" == "200" ]; then
    echo "[$HORA] ✅ Req #$REQUEST_COUNT | Status: 200 OK | $BODY"
  elif [ "$HTTP_CODE" == "503" ]; then
    echo "[$HORA] 🛑 Req #$REQUEST_COUNT | Status: 503 Service Unavailable (Botão do pânico ATIVADO!)"
  elif [ -z "$HTTP_CODE" ] || [ "$HTTP_CODE" == "000" ]; then
    echo "[$HORA] ❌ Req #$REQUEST_COUNT | Servidor offline / Conexão recusada"
  else
    echo "[$HORA] ⚠️ Req #$REQUEST_COUNT | Status: $HTTP_CODE"
  fi
  
  sleep 0.5
done
