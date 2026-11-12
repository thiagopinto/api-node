#!/usr/bin/env bash

echo "🔄 Loop contínuo iniciado. Pressione Ctrl+C NESTE terminal para parar o teste."
echo "-------------------------------------------------------------------------"

while true; do
  HORA=$(date +'%H:%M:%S')
  # Faz a requisição capturando o código de status HTTP
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null)
  
  if [ "$HTTP_CODE" == "200" ]; then
    echo "[$HORA] ✅ Status: 200 OK"
  elif [ "$HTTP_CODE" == "503" ]; then
    echo "[$HORA] 🛑 Status: 503 Service Unavailable (Servidor rejeitando novas conexões / em shutdown)"
  elif [ -z "$HTTP_CODE" ] || [ "$HTTP_CODE" == "000" ]; then
    echo "[$HORA] ❌ Servidor offline / Conexão recusada"
  else
    echo "[$HORA] ⚠️ Status: $HTTP_CODE"
  fi
  
  sleep 0.5
done
