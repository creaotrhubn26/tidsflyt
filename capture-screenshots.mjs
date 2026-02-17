#!/usr/bin/env node
import puppeteer from 'puppeteer';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.join(__dirname, 'client', 'public', 'screenshots');

// Create screenshots directory
await fs.ensureDir(screenshotsDir);

const baseUrl = 'http://localhost:5000';

const pages = [
  { url: '/', name: 'landing', width: 1200, height: 800 },
  { url: '/time', name: 'time-tracking', width: 1200, height: 900 },
  { url: '/reports', name: 'reports-dashboard', width: 1200, height: 900 },
  { url: '/cases', name: 'case-management', width: 1200, height: 800 },
  { url: '/admin/access-requests', name: 'admin-panel', width: 1200, height: 700 },
];

try {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  console.log('📸 Starting screenshot capture...\n');

  for (const page of pages) {
    try {
      const browserPage = await browser.newPage();
      await browserPage.setViewport({
        width: page.width,
        height: page.height,
      });

      console.log(`Capturing: ${page.url} (${page.name})`);
      await browserPage.goto(`${baseUrl}${page.url}`, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Wait for content to load
      await new Promise(resolve => setTimeout(resolve, 2000));

      const screenshotPath = path.join(screenshotsDir, `${page.name}.png`);
      const webpPath = path.join(screenshotsDir, `${page.name}.webp`);

      // PNG screenshot
      await browserPage.screenshot({
        path: screenshotPath,
        type: 'png',
        fullPage: false,
      });

      // WebP screenshot (smaller file size)
      await browserPage.screenshot({
        path: webpPath,
        type: 'webp',
      });

      console.log(`✓ Saved: ${page.name}.png & .webp\n`);

      await browserPage.close();
    } catch (err) {
      console.error(`✗ Failed to capture ${page.name}:`, err.message);
    }
  }

  await browser.close();
  console.log('✅ Screenshot capture complete!');
  console.log(`📁 Screenshots saved to: ${screenshotsDir}`);
} catch (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}
