import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { enqueueMutation, isQueueableMethod, isQueueableUrl } from "./offline-queue";

function normalizeRequestUrl(url: string): string {
  if (!url) return "/";
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return url.startsWith("/") ? url : `/${url}`;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

/**
 * Build a synthetic 202 response that mirrors what a successful POST would
 * look like — used when the request has been queued offline so UI code can
 * treat the queued mutation as "accepted, will sync later".
 */
function queuedResponse(body: unknown): Response {
  const payload = { queued: true, offline: true, data: body ?? null };
  return new Response(JSON.stringify(payload), {
    status: 202,
    headers: { "Content-Type": "application/json", "X-Tidum-Queued": "1" },
  });
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const normalizedUrl = normalizeRequestUrl(url);

  // Offline-first: if we're offline AND the mutation is safely queueable,
  // persist to IDB and return a synthetic 202 so the caller can proceed.
  const canQueue = isQueueableMethod(method) && isQueueableUrl(normalizedUrl);
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (canQueue && offline) {
    await enqueueMutation({
      url: normalizedUrl,
      method: method.toUpperCase() as any,
      body: data,
    });
    return queuedResponse(data);
  }

  try {
    const res = await fetch(normalizedUrl, {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
    await throwIfResNotOk(res);
    return res;
  } catch (err) {
    // Network error while online is reported as online=true in some browsers.
    // Catch genuine fetch failures (TypeError / AbortError) and queue them too.
    if (canQueue && err instanceof TypeError) {
      await enqueueMutation({
        url: normalizedUrl,
        method: method.toUpperCase() as any,
        body: data,
      });
      return queuedResponse(data);
    }
    throw err;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    let url = queryKey[0] as string;
    
    if (queryKey.length > 1 && typeof queryKey[1] === "object" && queryKey[1] !== null) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(queryKey[1] as Record<string, string | undefined>)) {
        if (value !== undefined && value !== null && value !== "") {
          params.append(key, String(value));
        }
      }
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    } else if (queryKey.length > 1) {
      url = queryKey.filter(k => typeof k === "string").join("/");
    }

    url = normalizeRequestUrl(url);
    
    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 30000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
