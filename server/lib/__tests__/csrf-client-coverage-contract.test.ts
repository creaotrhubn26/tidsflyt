import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

const clientRoot = join(process.cwd(), "client", "src");

describe("CSRF client transport coverage", () => {
  it("installs the fetch wrapper before offline mutations and React startup", () => {
    const source = readFileSync(join(clientRoot, "main.tsx"), "utf8");
    expect(source.indexOf("installCsrfFetch();")).toBeLessThan(
      source.indexOf("installOfflineQueue();"),
    );
    expect(source.indexOf("installCsrfFetch();")).toBeLessThan(
      source.indexOf("createRoot("),
    );
  });

  it("adds the CSRF header to every remaining XMLHttpRequest transport", () => {
    const xhrFiles = sourceFiles(clientRoot).filter((path) =>
      readFileSync(path, "utf8").includes("new XMLHttpRequest()"),
    );

    expect(xhrFiles.length).toBeGreaterThan(0);
    for (const path of xhrFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("getCsrfTokenForRequest");
      expect(source).toContain("setRequestHeader('x-csrf-token', csrfToken)");
    }
  });

  it("does not use sendBeacon, which cannot attach a CSRF header", () => {
    const offenders = sourceFiles(clientRoot).filter((path) =>
      readFileSync(path, "utf8").includes("navigator.sendBeacon"),
    );
    expect(offenders).toEqual([]);
  });

  it("logs out through a protected POST and keeps GET side-effect free", () => {
    const hookSource = readFileSync(
      join(clientRoot, "hooks", "use-auth.ts"),
      "utf8",
    );
    const authSources = [
      join(process.cwd(), "server", "custom-auth.ts"),
      join(process.cwd(), "server", "replit_integrations", "auth", "replitAuth.ts"),
    ].map((path) => readFileSync(path, "utf8"));

    expect(hookSource).toContain('fetch("/api/logout", {');
    expect(hookSource).toContain('method: "POST"');
    for (const source of authSources) {
      expect(source).toContain('app.post("/api/logout"');
      expect(source).toContain('app.get("/api/logout", (_req, res) => {');
      expect(source).toContain('res.status(405)');
    }
  });
});
