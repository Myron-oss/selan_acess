export function fetchWithNoStore(
  input: RequestInfo | URL,
  init?: RequestInit
) {
  return fetch(input, { ...init, cache: "no-store" });
}
