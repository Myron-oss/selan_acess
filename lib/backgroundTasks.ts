import "server-only";

type WaitUntil = (promise: Promise<unknown>) => void;

interface RequestContextValue {
  waitUntil?: WaitUntil;
}

interface RequestContext {
  get(): RequestContextValue | undefined;
}

const REQUEST_CONTEXT_SYMBOL = Symbol.for("@next/request-context");

export function runAfterResponse(task: Promise<unknown>): void {
  const guardedTask = task.catch((error) => {
    console.error("Background task failed", error);
  });
  const requestContext = (
    globalThis as unknown as Record<symbol, RequestContext | undefined>
  )[REQUEST_CONTEXT_SYMBOL]?.get();

  if (requestContext?.waitUntil) {
    requestContext.waitUntil(guardedTask);
    return;
  }

  // Локальный Next.js dev-сервер не всегда предоставляет платформенный
  // request context. Ошибка уже перехвачена выше, поэтому fallback безопасен.
  void guardedTask;
}
