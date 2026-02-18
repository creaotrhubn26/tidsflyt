import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { seoMiddleware } from "./seo-middleware";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // SEO middleware — intercept crawler requests and inject proper meta tags
  const indexHtmlPath = path.resolve(distPath, "index.html");
  let cachedHtml: string | null = null;
  const getProdHtml = async () => {
    if (!cachedHtml) {
      cachedHtml = await fs.promises.readFile(indexHtmlPath, "utf-8");
    }
    return cachedHtml;
  };
  app.use("*", seoMiddleware(getProdHtml));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(indexHtmlPath);
  });
}
