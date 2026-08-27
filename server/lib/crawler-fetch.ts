import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { resolveCrawlerUrl } from "./crawler-url-policy";

interface CrawlerFetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

/**
 * GET a public web URL while pinning the validated DNS result to the socket.
 * Redirects are deliberately returned to the caller for per-hop validation.
 */
export async function fetchCrawlerUrl(rawUrl: string, options: CrawlerFetchOptions = {}): Promise<Response> {
  const { url, addresses } = await resolveCrawlerUrl(rawUrl);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxResponseBytes = options.maxResponseBytes ?? 10 * 1024 * 1024;
  const selected = addresses.find(({ family }) => family === 4) ?? addresses[0];

  const pinnedLookup: LookupFunction = ((
    _hostname: string,
    lookupOptions: any,
    callback: (...args: any[]) => void,
  ) => {
    if (lookupOptions?.all) {
      callback(null, [selected]);
      return;
    }
    callback(null, selected.address, selected.family);
  }) as LookupFunction;

  return new Promise<Response>((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(url, {
      method: "GET",
      headers: options.headers,
      lookup: pinnedLookup,
    });

    const timer = setTimeout(() => {
      request.destroy(new Error("Crawler-forespørselen brukte for lang tid"));
    }, timeoutMs);

    const rejectWithCleanup = (error: Error) => {
      clearTimeout(timer);
      reject(error);
    };

    request.once("error", rejectWithCleanup);

    request.once("response", (incoming) => {
      const chunks: Buffer[] = [];
      let bytes = 0;

      incoming.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maxResponseBytes) {
          incoming.destroy(new Error("Crawler-responsen er for stor"));
          return;
        }
        chunks.push(chunk);
      });
      incoming.once("aborted", () => rejectWithCleanup(new Error("Crawler-responsen ble avbrutt")));
      incoming.once("error", rejectWithCleanup);
      incoming.once("end", () => {
        clearTimeout(timer);
        const headers = new Headers();
        for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
          headers.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1]);
        }
        const hasNullBody = [204, 205, 304].includes(incoming.statusCode ?? 500);
        const response = new Response(hasNullBody ? null : Buffer.concat(chunks), {
          status: incoming.statusCode ?? 500,
          statusText: incoming.statusMessage,
          headers,
        });
        Object.defineProperty(response, "url", { value: url.href });
        resolve(response);
      });
    });

    request.end();
  });
}
