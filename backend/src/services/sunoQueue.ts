/**
 * Очередь для ограничения concurrency запросов к Suno API
 * Предотвращает перегрузку API и rate limiting
 */

import { Logger } from "../utils/logger";

interface QueuedTask<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

export class SunoQueue {
  private queue: QueuedTask<any>[] = [];
  private running = 0;
  private concurrency: number;
  private delayMs: number;

  constructor(concurrency: number = 1, delayMs: number = 1500) {
    this.concurrency = concurrency;
    this.delayMs = delayMs;

    Logger.info("[SunoQueue] Initialized", {
      concurrency,
      delayMs
    });
  }

  /**
   * Добавить задачу в очередь
   */
  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.process();
    });
  }

  /**
   * Обработать очередь
   */
  private async process(): Promise<void> {
    // Если уже запущено максимальное количество задач или очередь пуста
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    // Берём задачу из очереди
    const task = this.queue.shift();
    if (!task) {
      return;
    }

    this.running++;

    try {
      // Выполняем задачу
      const result = await task.fn();
      task.resolve(result);

      // Задержка перед следующей задачей (если есть ещё задачи)
      if (this.queue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, this.delayMs));
      }
    } catch (error) {
      task.reject(error as Error);
    } finally {
      this.running--;
      // Продолжаем обработку очереди
      this.process();
    }
  }

  /**
   * Получить текущий размер очереди
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Получить количество выполняющихся задач
   */
  getRunningCount(): number {
    return this.running;
  }
}

// Singleton instance
let sunoQueueInstance: SunoQueue | null = null;

export function getSunoQueue(): SunoQueue {
  if (!sunoQueueInstance) {
    const concurrency = Number(process.env.MUSIC_CLIPS_SUNO_CONCURRENCY) || 1;
    const delayMs = Number(process.env.MUSIC_CLIPS_SUNO_DELAY_MS) || 1500;
    sunoQueueInstance = new SunoQueue(concurrency, delayMs);
  }
  return sunoQueueInstance;
}

