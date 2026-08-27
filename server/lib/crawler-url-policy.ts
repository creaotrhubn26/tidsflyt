import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface CrawlerLookupAddress {
  address: string;
  family: 4 | 6;
}

export type CrawlerDnsResolver = (hostname: string) => Promise<CrawlerLookupAddress[]>;

export interface ResolvedCrawlerUrl {
  url: URL;
  addresses: CrawlerLookupAddress[];
}

const blockedHostSuffixes = [".localhost", ".local", ".internal", ".home", ".lan"];

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function parseIpv4(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const values = parts.map((part) => Number(part));
  return values.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? values
    : null;
}

function isPublicIpv4(address: string): boolean {
  const parts = parseIpv4(address);
  if (!parts) return false;
  const [a, b, c] = parts;

  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false;
  return true;
}

function parseIpv6(address: string): number[] | null {
  const withoutZone = address.split("%")[0].toLowerCase();
  if (!withoutZone || withoutZone.includes(":::")) return null;

  let normalized = withoutZone;
  const ipv4Match = normalized.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (ipv4Match) {
    const ipv4 = parseIpv4(ipv4Match[1]);
    if (!ipv4) return null;
    const ipv4Hextets = [
      ((ipv4[0] << 8) | ipv4[1]).toString(16),
      ((ipv4[2] << 8) | ipv4[3]).toString(16),
    ];
    normalized = normalized.slice(0, -ipv4Match[1].length) + ipv4Hextets.join(":");
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;

  const words = [
    ...left,
    ...Array(halves.length === 2 ? missing : 0).fill("0"),
    ...right,
  ].map((part) => Number.parseInt(part, 16));

  return words.length === 8 && words.every((part) => Number.isInteger(part) && part >= 0 && part <= 0xffff)
    ? words
    : null;
}

function isPublicIpv6(address: string): boolean {
  const words = parseIpv6(address);
  if (!words) return false;

  if (words.every((word) => word === 0)) return false;
  if (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) return false;
  if ((words[0] & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
  if ((words[0] & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((words[0] & 0xff00) === 0xff00) return false; // multicast ff00::/8
  if (words[0] === 0x100 && words.slice(1, 4).every((word) => word === 0)) return false; // discard-only 100::/64
  if (words[0] === 0x2001 && words[1] === 0x0db8) return false; // documentation
  if (words[0] === 0x2002) return false; // 6to4 can encode private IPv4 targets

  const isIpv4Mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  const isIpv4Compatible = words.slice(0, 6).every((word) => word === 0);
  if (isIpv4Mapped || isIpv4Compatible) {
    const ipv4 = `${words[6] >> 8}.${words[6] & 0xff}.${words[7] >> 8}.${words[7] & 0xff}`;
    return isPublicIpv4(ipv4);
  }

  return true;
}

export function isPublicCrawlerAddress(address: string): boolean {
  const normalized = stripIpv6Brackets(address);
  const family = isIP(normalized);
  return family === 4
    ? isPublicIpv4(normalized)
    : family === 6
      ? isPublicIpv6(normalized)
      : false;
}

async function defaultResolver(hostname: string): Promise<CrawlerLookupAddress[]> {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  return addresses.map(({ address, family }) => ({ address, family: family as 4 | 6 }));
}

export async function resolveCrawlerUrl(
  rawUrl: string,
  resolver: CrawlerDnsResolver = defaultResolver,
): Promise<ResolvedCrawlerUrl> {
  if (typeof rawUrl !== "string" || rawUrl.length === 0 || rawUrl.length > 2048) {
    throw new Error("Ugyldig crawler-URL");
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Ugyldig crawler-URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Crawleren tillater bare HTTP og HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("Crawler-URL kan ikke inneholde innloggingsinformasjon");
  }
  url.hash = "";

  const hostname = stripIpv6Brackets(url.hostname).toLowerCase();
  if (
    hostname === "localhost" ||
    !hostname.includes(".") && isIP(hostname) === 0 ||
    blockedHostSuffixes.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new Error("Lokale vertsnavn er ikke tillatt");
  }

  const directFamily = isIP(hostname);
  const addresses = directFamily
    ? [{ address: hostname, family: directFamily as 4 | 6 }]
    : await resolver(hostname);

  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicCrawlerAddress(address))) {
    throw new Error("Crawler-URL peker til en lokal eller privat nettverksadresse");
  }

  return { url, addresses };
}
