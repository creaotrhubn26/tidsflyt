import { readFileSync, writeFileSync } from 'fs';

let src = readFileSync('tests/full-workflow-e2e.spec.ts', 'utf8');

// Step 1: Remove mockApiFallback calls that appear right before page.goto
// (they're in the wrong position - after specific mocks)
src = src.replace(/\n    await mockApiFallback\(page\);\n    await page\.goto\(/g,
  '\n    await page.goto(');

// Step 2: Insert mockApiFallback at the very START of each test body
// (before specific route mocks, so it has lowest priority in reverse-order routing)
let count = 0;
src = src.replace(
  /(  test\("Steg \d+[^"]*", async \(\{ page \}, testInfo\) => \{)\n/g,
  (m, p1) => {
    count++;
    return p1 + '\n    await mockApiFallback(page);\n';
  }
);

console.log(`Moved mockApiFallback to start of ${count} tests`);
writeFileSync('tests/full-workflow-e2e.spec.ts', src);
