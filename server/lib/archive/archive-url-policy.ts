import { isIP } from "node:net";

function configuredHosts(): Set<string> {
  return new Set((process.env.ARCHIVE_ALLOWED_HOSTS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean));
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168);
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "::1" || normalized === "::"
    || normalized.startsWith("fc") || normalized.startsWith("fd")
    || normalized.startsWith("fe8") || normalized.startsWith("fe9")
    || normalized.startsWith("fea") || normalized.startsWith("feb")
    || normalized.startsWith("::ffff:");
}

export function validateArchiveBaseUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("ARCHIVE_URL_INVALID");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) {
    throw new Error("ARCHIVE_URL_INVALID");
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  const allowed = configuredHosts();
  if (allowed.has(hostname)) return parsed;
  if (process.env.NODE_ENV === "production") throw new Error("ARCHIVE_HOST_NOT_ALLOWLISTED");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("ARCHIVE_HOST_NOT_ALLOWED");
  }
  const ipVersion = isIP(hostname);
  if ((ipVersion === 4 && isPrivateIpv4(hostname)) || (ipVersion === 6 && isPrivateIpv6(hostname))) {
    throw new Error("ARCHIVE_HOST_NOT_ALLOWED");
  }
  return parsed;
}
