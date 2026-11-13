# Arquitetura de Resiliência: Graceful Shutdown & Botão do Pânico Distribuído

Guia de referência arquitetural e técnico para implementação dos padrões de **Graceful Shutdown com Requisições em Voo** e **Botão do Pânico Distribuído (Distributed Circuit Breaker)** em ecossistemas de microsserviços Node.js + TypeScript.

---

## 📑 Sumário

1. [Visão Geral e Objetivos](#visão-geral-e-objetivos)
2. [Arquitetura: Gestão (Control Plane) vs Consumo (Data Plane)](#arquitetura-gestão-control-plane-vs-consumo-data-plane)
3. [Pilares de Engenharia e Boas Práticas](#pilares-de-engenharia-e-boas-práticas)
   - [Pilar 1: Fail-Closed no Bootstrap](#1-fail-closed-no-bootstrap-segurança-por-padrão)
   - [Pilar 2: Inicialização Concorrente com `SET NX`](#2-inicialização-concorrente-com-set-nx)
   - [Pilar 3: Transação Atômica (`MULTI / EXEC`)](#3-transação-atômica-multiexec)
   - [Pilar 4: Zero Latência de Rede no Runtime](#4-zero-latência-de-rede-no-runtime)
   - [Pilar 5: In-Flight Requests e Graceful Shutdown](#5-in-flight-requests-e-graceful-shutdown)
4. [Estrutura de Pastas Recomendada](#estrutura-de-pastas-recomendada)
5. [Guia de Implementação no seu Ecossistema](#guia-de-implementação-no-seu-ecossistema)
   - [Passo 1: Constantes do Redis](#passo-1-constantes-do-redis)
   - [Passo 2: Service de Gestão (Control Plane)](#passo-2-service-de-gestão-control-plane)
   - [Passo 3: Middleware de Consumo (Data Plane)](#passo-3-middleware-de-consumo-data-plane)
   - [Passo 4: Middleware de In-Flight Requests](#passo-4-middleware-de-in-flight-requests)
   - [Passo 5: Bootstrap Seguro no Servidor HTTP](#passo-5-bootstrap-seguro-no-servidor-http)
6. [Endpoints Administrativos e Operação](#endpoints-administrativos-e-operação)

---

## 🎯 Visão Geral e Objetivos

Em arquiteturas distribuídas e microsserviços de missão crítica (ex.: gateways de pagamento, processamento financeiro, mensageria), duas vulnerabilidades operacionais são muito comuns:

1. **Derrubada abrupta do processo (deploy / autoscaling):** Conexões em andamento são interrompidas na metade, causando erros 502/504 no cliente ou transações corrompidas.
2. **Dependência externa fora do ar (cascata de falhas):** Quando um parceiro externo ou banco de dados degrada, não há como cortar imediatamente endpoints específicos sem fazer um novo deploy ou derrubar o pod inteiro.

Este projeto resolve ambos os problemas combinando **Graceful Shutdown com contagem de requisições ativas** e um **Botão do Pânico Distribuído** baseado em **Redis Pub/Sub + Chave Persistida**.

---

## 🏛️ Arquitetura: Gestão (Control Plane) vs Consumo (Data Plane)

```text
 ┌────────────────────────────────────────────────────────┐
 │            Módulo de Gestão (Control Plane)            │
 │     (Painel Admin / Backoffice / API Gateway)          │
 └───────────────────────────┬────────────────────────────┘
                             │
                  POST /admin/panic { active: true }
                             │
                             ▼
         ┌───────────────────────────────────────┐
         │      Redis: MULTI / EXEC (Atômico)    │
         │  1. SET panic:global_state "true"     │
         │  2. PUBLISH channel_panic "true"      │
         └───────┬───────────────────────┬───────┘
                 │ (Evento Pub/Sub)      │ (Evento Pub/Sub)
                 ▼                       ▼
   ┌───────────────────────────┐   ┌───────────────────────────┐
   │ Microsserviço Pagamentos  │   │  Microsserviço Pedidos    │
   │  - Memória: panic = true  │   │  - Memória: panic = true  │
   │  - /checkout ──> HTTP 503 │   │  - /pedidos ──> HTTP 503  │
   │  - /health   ──> HTTP 200 │   │  - /health  ──> HTTP 200  │
   └───────────────────────────┘   └───────────────────────────┘
```

* **Control Plane (Gestão):** Onde os operadores ou sistemas de monitoramento acionam o pânico. Responsável por gravar a chave persistida e emitir o evento no canal.
* **Data Plane (Consumo):** Cada microsserviço que processa rotas críticas. Escuta o canal e aplica a regra de negócio localmente via middleware com zero latência.

---

## ⚙️ Pilares de Engenharia e Boas Práticas

### 1. Fail-Closed no Bootstrap (Segurança por Padrão)
* **A regra:** A variável em memória de cada microsserviço nasce como **`isPanicActive = true`**.
* **Por quê:** Se o microsserviço subir enquanto o Redis estiver instável ou demorar para responder, ele **não libera** rotas críticas até ter 100% de confirmação de que o cluster está saudável.
* **Ordem do Boot:** Primeiro sincroniza o estado com o Redis via `await setupPanicConsumer(redis, service)`; **somente depois** chama `app.listen(PORT)`. Isso elimina qualquer janela de corrida (*race condition*).

### 2. Inicialização Concorrente com `SET NX`
* **A regra:** Na primeira leitura, usamos `await redis.set(PANIC_REDIS_KEY, "false", "NX")`.
* **Por quê:** O modificador `NX` (*Not eXists*) é atômico no Redis. Se 50 pods subirem simultaneamente com o Redis vazio:
  - Apenas o primeiro grava `"false"`.
  - Os outros 49 não alteram nada.
  - Se alguém já tiver ativado o pânico (`"true"`), um pod novo reiniciando **nunca sobrescreve** esse `"true"`.

### 3. Transação Atômica (`MULTI / EXEC`)
* **A regra:** No service de gestão, a alteração da chave no Redis e o disparo no Pub/Sub devem ser executados dentro de um pipeline transacional:
  ```typescript
  const results = await redis.multi()
    .set(PANIC_REDIS_KEY, stringValue)
    .publish(PANIC_CHANNEL, stringValue)
    .exec();
  ```
* **Por quê:** Garante que a chave persistida e o evento em tempo real nunca fiquem dessincronizados, mesmo sob alta concorrência.

### 4. Zero Latência de Rede no Runtime
* **A regra:** O middleware **nunca** executa comandos de rede no Redis a cada requisição HTTP.
* **Por quê:** Uma consulta de rede ao Redis por requisição adicionaria entre 1ms e 5ms de latência em cada chamada HTTP. O padrão Pub/Sub atualiza a variável em memória local (`isPanicActive`) no momento do evento, permitindo que o middleware tome a decisão em **menos de 0.01ms**.

### 5. In-Flight Requests e Graceful Shutdown
* **A regra:**
  - Incrementa contador atômico ao entrar na rota: `inFlightRequests++`.
  - Decrementa ao finalizar (`res.on('finish')` ou `res.on('close')`).
  - Ao receber `SIGTERM` / `SIGINT`:
    1. Para de aceitar novas conexões HTTP (`server.close()`).
    2. Novas requisições recebem `503 Service Unavailable` com cabeçalho `Connection: close`.
    3. Aguarda `inFlightRequests === 0` antes de invocar `process.exit(0)`.
    4. Possui *timeout* forçado (ex: 10s) para evitar travamentos infinitos.

---

## 📁 Estrutura de Pastas Recomendada

```text
src/
├── constants/
│   └── panic.ts             # Nomes do Canal Pub/Sub e Chave Redis
├── infra/
│   └── redis.ts             # Cliente ioredis singleton configurado com TLS e timeouts
├── services/
│   └── panicService.ts      # [GESTÃO] Leitura segura (SET NX) e Escrita Atômica (MULTI/EXEC)
├── middlewares/
│   ├── inFlight.ts          # [RESILIÊNCIA] Contador de requisições em voo & Graceful Shutdown
│   └── panicMiddleware.ts   # [CONSUMO] Inicia Fail-Closed, assina canal e intercepta com 503
└── server.ts                # Bootstrap ordenado e registro de rotas
```

---

## 🚀 Guia de Implementação no seu Ecossistema

### Passo 1: Constantes do Redis
Crie `src/constants/panic.ts`:
```typescript
export const PANIC_CHANNEL = "channel_panic";
export const PANIC_REDIS_KEY = "panic:global_state";
```

### Passo 2: Service de Gestão (Control Plane)
Crie `src/services/panicService.ts`:
```typescript
import { type Redis } from "ioredis";
import { PANIC_CHANNEL, PANIC_REDIS_KEY } from "../constants/panic.js";

export class PanicService {
  constructor(private readonly redis: Redis) {}

  async getGlobalStatus(): Promise<boolean> {
    // Só grava false se a chave não existir previamente
    await this.redis.set(PANIC_REDIS_KEY, "false", "NX");
    const value = await this.redis.get(PANIC_REDIS_KEY);
    return value === "true" || value === "1";
  }

  async setGlobalStatus(active: boolean) {
    const stringValue = active ? "true" : "false";

    // Transação atômica no Redis
    const results = await this.redis
      .multi()
      .set(PANIC_REDIS_KEY, stringValue)
      .publish(PANIC_CHANNEL, stringValue)
      .exec();

    if (!results) {
      throw new Error("Transação atômica do Redis abortada.");
    }

    const publishResult = results[1]?.[1];
    return {
      success: true,
      active,
      subscribersNotified: typeof publishResult === "number" ? publishResult : 0,
    };
  }
}
```

### Passo 3: Middleware de Consumo (Data Plane)
Crie `src/middlewares/panicMiddleware.ts`:
```typescript
import { type Request, type Response, type NextFunction } from "express";
import { type Redis } from "ioredis";
import { PANIC_CHANNEL } from "../constants/panic.js";
import { PanicService } from "../services/panicService.js";

// Fail-Closed: nasce bloqueado na memória por segurança
let isPanicActive = true;
let subscriberClient: Redis | null = null;

export async function setupPanicConsumer(redis: Redis, panicService?: PanicService): Promise<void> {
  const service = panicService ?? new PanicService(redis);

  // Duplica conexão para isolar o modo Pub/Sub
  subscriberClient = redis.duplicate();

  subscriberClient.on("message", (channel, message) => {
    if (channel === PANIC_CHANNEL) {
      const normalized = message.trim().toLowerCase();
      isPanicActive = normalized === "true" || normalized === "1";
      console.log(`📡 [Panic Consumer] Estado atualizado via canal: ${isPanicActive}`);
    }
  });

  await subscriberClient.subscribe(PANIC_CHANNEL);

  // Sincronização inicial no boot
  try {
    isPanicActive = await service.getGlobalStatus();
  } catch (error) {
    isPanicActive = true; // Mantém seguro se falhar
    console.error("⚠️ Falha ao ler Redis no boot. Mantendo PÂNICO ATIVO (Fail-Closed).");
  }
}

export function getPanicLocalState(): boolean {
  return isPanicActive;
}

export function panicMiddleware(req: Request, res: Response, next: NextFunction) {
  if (isPanicActive) {
    return res.status(503).json({
      statusCode: 503,
      error: "Service Unavailable",
      message: "Este endpoint foi temporariamente desabilitado pelo botão de pânico.",
      timestamp: new Date().toISOString(),
    });
  }
  next();
}
```

### Passo 4: Middleware de In-Flight Requests
Crie `src/middlewares/inFlight.ts`:
```typescript
import { type Request, type Response, type NextFunction } from "express";
import { type Server } from "node:http";

let inFlightRequests = 0;
let isShuttingDown = false;

export function inFlightMiddleware(req: Request, res: Response, next: NextFunction) {
  if (isShuttingDown) {
    res.setHeader("Connection", "close");
    return res.status(503).json({
      error: "Service Unavailable",
      message: "Servidor em processo de encerramento.",
    });
  }

  inFlightRequests++;
  let decremented = false;
  const decrement = () => {
    if (!decremented) {
      decremented = true;
      inFlightRequests--;
    }
  };

  res.on("finish", decrement);
  res.on("close", decrement);
  next();
}

export function getInFlightCount(): number {
  return inFlightRequests;
}

export function setupGracefulShutdown(server: Server, timeoutMs = 10000) {
  const shutdown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n🛑 Sinal [${signal}] recebido. Iniciando Graceful Shutdown...`);

    server.close((err) => {
      if (err) process.exit(1);
    });

    const forceTimeout = setTimeout(() => {
      console.error(`⚠️ Timeout de ${timeoutMs}ms atingido. Forçando shutdown com ${inFlightRequests} conexões.`);
      process.exit(1);
    }, timeoutMs);
    forceTimeout.unref();

    const interval = setInterval(() => {
      if (inFlightRequests === 0) {
        clearInterval(interval);
        clearTimeout(forceTimeout);
        console.log("🎉 Todas as requisições em voo finalizaram. Encerrando.");
        process.exit(0);
      }
    }, 200);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
```

### Passo 5: Bootstrap Seguro no Servidor HTTP
No seu arquivo de inicialização (`src/server.ts`):
```typescript
import express from "express";
import { inFlightMiddleware, setupGracefulShutdown } from "./middlewares/inFlight.js";
import { redisClient } from "./infra/redis.js";
import { PanicService } from "./services/panicService.js";
import { setupPanicConsumer, panicMiddleware } from "./middlewares/panicMiddleware.js";

const app = express();
const panicService = new PanicService(redisClient);

app.use(express.json());
app.use(inFlightMiddleware);

// Rota pública não afetada pelo pânico
app.get("/health", (req, res) => res.json({ status: "OK" }));

// Rota crítica protegida
app.post("/pagamento", panicMiddleware, (req, res) => {
  res.json({ status: "Pagamento processado com sucesso!" });
});

async function bootstrap() {
  // 1. Sincroniza o pânico com o Redis ANTES de abrir a porta HTTP
  await setupPanicConsumer(redisClient, panicService);

  // 2. Abre a porta HTTP para receber conexões
  const server = app.listen(process.env.PORT || 3000, () => {
    console.log("🚀 Servidor HTTP iniciado com sucesso.");
  });

  // 3. Conecta o Graceful Shutdown
  setupGracefulShutdown(server);
}

bootstrap();
```

---

## 📡 Endpoints Administrativos e Operação

Se este microsserviço também expuser a API de Gestão (ou se ela estiver em um API Gateway/Backoffice):

### 1. Consultar Status do Cluster
```bash
curl -s http://localhost:3000/admin/panic | jq .
```
**Resposta:**
```json
{
  "localPanicState": false,
  "globalPanicState": false,
  "timestamp": "2026-11-13T17:40:00.000Z"
}
```

### 2. Ativar Botão do Pânico (Interromper Endpoints Críticos)
```bash
curl -X POST http://localhost:3000/admin/panic \
  -H "Content-Type: application/json" \
  -d '{"active": true}'
```
* **Efeito imediato:** Todos os microsserviços do cluster passam a responder `503 Service Unavailable` nos endpoints com `panicMiddleware`.

### 3. Desativar Botão do Pânico (Restabelecer Normalidade)
```bash
curl -X POST http://localhost:3000/admin/panic \
  -H "Content-Type: application/json" \
  -d '{"active": false}'
```
* **Efeito imediato:** Todos os microsserviços voltam a responder `200 OK`.
