#!/usr/bin/env node
import fs from "fs";
import path from "path";

const dashboardDir = path.resolve(process.cwd(), "client/src/components/dashboard");

const filesToCheck = fs.existsSync(dashboardDir)
  ? fs
      .readdirSync(dashboardDir)
      .filter((name) => name.endsWith(".tsx"))
      .map((name) => path.join("client/src/components/dashboard", name))
  : [];

const hexColorRegex = /#[0-9a-fA-F]{3,8}\b/g;

const findings = [];

for (const relativeFilePath of filesToCheck) {
  const absoluteFilePath = path.resolve(process.cwd(), relativeFilePath);

  if (!fs.existsSync(absoluteFilePath)) {
    findings.push({
      file: relativeFilePath,
      line: 0,
      color: "(missing file)",
      reason: "File not found",
    });
    continue;
  }

  const content = fs.readFileSync(absoluteFilePath, "utf8");
  const lines = content.split("\n");

  lines.forEach((line, lineIndex) => {
    const matches = line.match(hexColorRegex);
    if (!matches) return;

    for (const color of matches) {
      findings.push({
        file: relativeFilePath,
        line: lineIndex + 1,
        color,
        reason: "Hard-coded hex color found; use theme tokens instead.",
      });
    }
  });
}

if (findings.length > 0) {
  console.error("\nDesign token check failed:\n");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} -> ${finding.color} (${finding.reason})`);
  }
  console.error("\nReplace hard-coded colors with Tailwind theme tokens (e.g., bg-primary, text-foreground, border-border).\n");
  process.exit(1);
}

console.log("Design token check passed.");
