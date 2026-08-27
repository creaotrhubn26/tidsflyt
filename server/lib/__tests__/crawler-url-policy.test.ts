import { describe, expect, it } from "vitest";
import {
  isPublicCrawlerAddress,
  resolveCrawlerUrl,
  type CrawlerDnsResolver,
} from "../crawler-url-policy";

const publicResolver: CrawlerDnsResolver = async () => [
  { address: "93.184.216.34", family: 4 },
];

describe("crawler URL policy", () => {
  it("accepts ordinary public HTTP(S) targets", async () => {
    await expect(resolveCrawlerUrl("https://example.com/path#fragment", publicResolver))
      .resolves.toMatchObject({ url: new URL("https://example.com/path") });
    await expect(resolveCrawlerUrl("http://8.8.8.8/", publicResolver)).resolves.toBeDefined();
  });

  it.each([
    "file:///etc/passwd",
    "ftp://example.com/file",
    "https://user:password@example.com/",
    "http://localhost/",
    "http://service.internal/",
    "http://intranet/",
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.1/",
    "http://172.16.0.1/",
    "http://192.168.0.1/",
    "http://[::1]/",
    "http://[fc00::1]/",
    "http://[fe80::1]/",
    "http://[::ffff:127.0.0.1]/",
  ])("rejects unsafe target %s", async (target) => {
    await expect(resolveCrawlerUrl(target, publicResolver)).rejects.toThrow();
  });

  it("rejects DNS names when any returned address is private", async () => {
    const mixedResolver: CrawlerDnsResolver = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ];
    await expect(resolveCrawlerUrl("https://example.com", mixedResolver)).rejects.toThrow(
      "lokal eller privat",
    );
  });

  it("classifies special and public address ranges fail-closed", () => {
    expect(isPublicCrawlerAddress("93.184.216.34")).toBe(true);
    expect(isPublicCrawlerAddress("2606:4700:4700::1111")).toBe(true);
    expect(isPublicCrawlerAddress("198.51.100.1")).toBe(false);
    expect(isPublicCrawlerAddress("100::1")).toBe(false);
    expect(isPublicCrawlerAddress("2001:db8::1")).toBe(false);
    expect(isPublicCrawlerAddress("not-an-ip")).toBe(false);
  });
});
