#!/usr/bin/env bash

BASE_URL="http://localhost:3000"

echo "=========================================================="
echo " 1. Consultando estado inicial do Pânico (GET /admin/panic)"
echo "=========================================================="
curl -s "$BASE_URL/admin/panic" | jq . 2>/dev/null || curl -s "$BASE_URL/admin/panic"
echo -e "\n"

echo "=========================================================="
echo " 2. Chamando endpoint crítico /checkout (deve responder 200)"
echo "=========================================================="
curl -i "$BASE_URL/checkout"
echo -e "\n"

echo "=========================================================="
echo " 3. ATIVANDO O BOTÃO DO PÂNICO GLOBAL VIA API (POST /admin/panic)"
echo "=========================================================="
curl -s -X POST "$BASE_URL/admin/panic" \
  -H "Content-Type: application/json" \
  -d '{"active": true}' | jq . 2>/dev/null || curl -s -X POST "$BASE_URL/admin/panic" -H "Content-Type: application/json" -d '{"active": true}'
echo -e "\n"

echo "=========================================================="
echo " 4. Testando /checkout com pânico ATIVO (deve responder 503!)"
echo "=========================================================="
curl -i "$BASE_URL/checkout"
echo -e "\n"

echo "=========================================================="
echo " 5. Testando rota raiz / (continua 200 OK!)"
echo "=========================================================="
curl -i "$BASE_URL/"
echo -e "\n"

echo "=========================================================="
echo " 6. DESATIVANDO O BOTÃO DO PÂNICO GLOBAL VIA API"
echo "=========================================================="
curl -s -X POST "$BASE_URL/admin/panic" \
  -H "Content-Type: application/json" \
  -d '{"active": false}' | jq . 2>/dev/null || curl -s -X POST "$BASE_URL/admin/panic" -H "Content-Type: application/json" -d '{"active": false}'
echo -e "\n"

echo "=========================================================="
echo " 7. Testando /checkout novamente (deve voltar a responder 200)"
echo "=========================================================="
curl -i "$BASE_URL/checkout"
echo -e "\n"
