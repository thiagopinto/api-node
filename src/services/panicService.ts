import { type Redis } from "ioredis";
import { PANIC_CHANNEL, PANIC_REDIS_KEY } from "../constants/panic";

export interface SetPanicResult {
  success: boolean;
  active: boolean;
  subscribersNotified: number;
}

/**
 * Service de GESTÃO do Botão do Pânico (Control Plane)
 * Responsável pela governança do estado global e publicação para os microsserviços.
 */
export class PanicService {
  constructor(private readonly redis: Redis) {}

  /**
   * Consulta o estado global atual no Redis.
   * REGRA: Se a chave não existir no Redis, cria atomicamente com "false" (NX)
   * e retorna false, garantindo que o cluster nasça liberado por padrão.
   */
  async getGlobalStatus(): Promise<boolean> {
    // SET NX: Só cria "false" se a chave ainda NÃO existir no Redis
    await this.redis.set(PANIC_REDIS_KEY, "false", "NX");

    // Lê o valor atual garantido
    const value = await this.redis.get(PANIC_REDIS_KEY);
    return value === "true" || value === "1";
  }

  /**
   * Altera o estado do pânico de forma ATÔMICA.
   * Utiliza MULTI/EXEC (Transação nativa do Redis):
   * 1. Atualiza a chave 'panic:global_state'
   * 2. Publica no canal 'channel_panic'
   * 
   * Ambos os comandos são executados em bloco sem chance de intercalação.
   */
  async setGlobalStatus(active: boolean): Promise<SetPanicResult> {
    const stringValue = active ? "true" : "false";

    // Transação Atômica do Redis
    const results = await this.redis
      .multi()
      .set(PANIC_REDIS_KEY, stringValue)
      .publish(PANIC_CHANNEL, stringValue)
      .exec();

    if (!results) {
      throw new Error("Falha na transação atômica do Redis (MULTI/EXEC abortado).");
    }

    // Valida se houve erro em algum dos comandos do pipeline
    const [setError, setResult] = results[0] ?? [new Error("Resposta do SET ausente"), null];
    const [publishError, publishResult] = results[1] ?? [new Error("Resposta do PUBLISH ausente"), null];

    if (setError) {
      throw new Error(`Erro ao atualizar chave do pânico no Redis: ${setError.message}`);
    }
    if (publishError) {
      throw new Error(`Erro ao publicar no canal do pânico no Redis: ${publishError.message}`);
    }

    const subscribersNotified = typeof publishResult === "number" ? publishResult : 0;

    return {
      success: true,
      active,
      subscribersNotified,
    };
  }
}
