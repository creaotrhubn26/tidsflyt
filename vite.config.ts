import { defineConfig, createLogger } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const logger = createLogger();
const shouldIgnoreWarning = (message: string) =>
  message.includes("did not pass the `from` option to `postcss.parse`");

export default defineConfig({
  customLogger: {
    ...logger,
    warn: (msg, options) => {
      if (shouldIgnoreWarning(msg)) return;
      logger.warn(msg, options);
    },
    warnOnce: (msg, options) => {
      if (shouldIgnoreWarning(msg)) return;
      logger.warnOnce(msg, options);
    },
  },
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
