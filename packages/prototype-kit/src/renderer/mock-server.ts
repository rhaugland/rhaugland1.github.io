import type { ManifestMockEndpoint } from "./types";

/**
 * client-side mock server that intercepts fetch calls matching mock endpoints.
 * injected into prototypes so they work as static exports without a real backend.
 */
export function createMockInterceptor(endpoints: ManifestMockEndpoint[]): void {
  if (typeof window === "undefined") return;

  const originalFetch = window.fetch;

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method?.toUpperCase() ?? "GET";

    const match = endpoints.find(
      (ep) => url.endsWith(ep.path) && ep.method === method
    );

    if (match) {
      await new Promise((r) => setTimeout(r, match.delayMs));
      return new Response(JSON.stringify(match.responseData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return originalFetch(input, init);
  };
}
