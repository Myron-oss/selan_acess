export interface ApiErrorBody {
  error?: string;
}

export async function apiFetch<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  fallbackError: string
): Promise<T> {
  const response = await fetch(input, init);
  let body: unknown;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const apiError = body as ApiErrorBody | null;
    throw new Error(
      typeof apiError?.error === "string" ? apiError.error : fallbackError
    );
  }

  return body as T;
}
