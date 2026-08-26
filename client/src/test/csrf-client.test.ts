import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("global CSRF fetch integration", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("adds a token to every same-origin mutation", async () => {
    const baseFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/csrf-token") return jsonResponse({ token: "token-1" });
      return jsonResponse({ ok: true });
    });
    globalThis.fetch = baseFetch as typeof fetch;

    const { installCsrfFetch } = await import("../lib/csrf");
    installCsrfFetch();
    await fetch("/api/save", { method: "POST", body: "{}" });

    expect(baseFetch).toHaveBeenCalledTimes(2);
    const mutationInit = baseFetch.mock.calls[1][1] as RequestInit;
    expect(new Headers(mutationInit.headers).get("x-csrf-token")).toBe("token-1");
  });

  it("never sends the token to absolute or scheme-relative cross-origin URLs", async () => {
    const baseFetch = vi.fn(async () => jsonResponse({ ok: true }));
    globalThis.fetch = baseFetch as typeof fetch;

    const { installCsrfFetch } = await import("../lib/csrf");
    installCsrfFetch();
    await fetch("https://external.example/write", { method: "POST" });
    await fetch("//external.example/write", { method: "POST" });

    expect(baseFetch).toHaveBeenCalledTimes(2);
    for (const [, init] of baseFetch.mock.calls) {
      expect(new Headers((init as RequestInit | undefined)?.headers).has("x-csrf-token")).toBe(false);
    }
  });

  it("retries once only when the server explicitly marks a CSRF failure", async () => {
    let tokenNumber = 0;
    let mutationNumber = 0;
    const baseFetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/csrf-token") {
        tokenNumber += 1;
        return jsonResponse({ token: `token-${tokenNumber}` });
      }
      mutationNumber += 1;
      if (mutationNumber === 1) {
        return jsonResponse(
          { message: "stale" },
          { status: 403, headers: { "x-csrf-error": "invalid-token" } },
        );
      }
      return jsonResponse({ ok: true });
    });
    globalThis.fetch = baseFetch as typeof fetch;

    const { installCsrfFetch } = await import("../lib/csrf");
    installCsrfFetch();
    const response = await fetch("/api/save", { method: "PATCH", body: "{}" });

    expect(response.status).toBe(200);
    expect(tokenNumber).toBe(2);
    expect(mutationNumber).toBe(2);
  });

  it("does not retry an ordinary authorization 403", async () => {
    const baseFetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/csrf-token") return jsonResponse({ token: "token-1" });
      return jsonResponse({ message: "forbidden" }, { status: 403 });
    });
    globalThis.fetch = baseFetch as typeof fetch;

    const { installCsrfFetch } = await import("../lib/csrf");
    installCsrfFetch();
    const response = await fetch("/api/admin-only", { method: "DELETE" });

    expect(response.status).toBe(403);
    expect(baseFetch).toHaveBeenCalledTimes(2);
  });

  it("does not fetch or attach a token for GET requests", async () => {
    const baseFetch = vi.fn(async () => jsonResponse({ ok: true }));
    globalThis.fetch = baseFetch as typeof fetch;

    const { installCsrfFetch } = await import("../lib/csrf");
    installCsrfFetch();
    await fetch("/api/read");

    expect(baseFetch).toHaveBeenCalledTimes(1);
    expect(String(baseFetch.mock.calls[0][0])).toBe("/api/read");
  });
});
