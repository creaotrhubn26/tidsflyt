import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".js", ".mjs", ".ts"].includes(extname(entry.name)) ? [path] : [];
  });
}

describe("PostgreSQL TLS contract", () => {
  it("never disables certificate validation for a configured TLS connection", () => {
    const roots = [join(process.cwd(), "server"), join(process.cwd(), "scripts")];
    const offenders = roots
      .flatMap(sourceFiles)
      .filter((path) => /rejectUnauthorized\s*:\s*false/.test(readFileSync(path, "utf8")));

    expect(offenders).toEqual([]);
  });
});
