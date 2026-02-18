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
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Extract heavy libraries into separate cacheable vendor chunks
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-")) {
            return "recharts-vendor";
          }
          if (id.includes("node_modules/react-quill") || id.includes("node_modules/quill")) {
            return "quill-vendor";
          }
          if (id.includes("node_modules/framer-motion")) {
            return "framer-vendor";
          }
          if (id.includes("node_modules/@dnd-kit")) {
            return "dndkit-vendor";
          }
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
