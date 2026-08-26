import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { seoMiddleware } from "./seo-middleware";

const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  // vite.config.ts exports an async config FUNCTION (needed to await
  // loadEnv() and dynamically import Replit-only plugins) — Vite's own
  // CLI resolves this automatically before use, but createViteServer()
  // here needs the resolved config OBJECT, not the function itself.
  // Spreading the raw function silently drops root/plugins/resolve.alias
  // (a function has no enumerable own properties), which made this dev
  // server default to the repo root instead of client/ and fail to find
  // client/src/main.tsx.
  const resolvedViteConfig =
    typeof viteConfig === "function"
      ? await (viteConfig as (env: { mode: string; command: "serve" | "build" }) => Promise<Record<string, unknown>>)({
          mode: process.env.NODE_ENV ?? "development",
          command: "serve",
        })
      : viteConfig;

  const vite = await createViteServer({
    ...resolvedViteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        // "Pre-transform error: ... Does the file exist?" is a transient
        // dependency-discovery race on a cold optimizeDeps cache (e.g.
        // right after clearing node_modules/.vite) — Vite's own client
        // normally recovers from this with an automatic full-reload.
        // Only exit on other, genuinely fatal Vite errors (plugin
        // crashes, config errors), not this self-healing one.
        if (options?.error && !msg.includes("Pre-transform error")) {
          process.exit(1);
        }
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  // SEO middleware — intercept crawler requests and inject meta tags
  const getDevHtml = async () => {
    const clientTemplate = path.resolve(
      import.meta.dirname,
      "..",
      "client",
      "index.html",
    );
    return fs.promises.readFile(clientTemplate, "utf-8");
  };
  app.use("*", seoMiddleware(getDevHtml));

  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
