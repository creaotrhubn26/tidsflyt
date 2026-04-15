import { defineConfig, createLogger, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const logger = createLogger();
const shouldIgnoreWarning = (message: string) =>
  message.includes("did not pass the `from` option to `postcss.parse`");

export default defineConfig(async ({ mode }) => {
  // Load VITE_* env vars from process.env + .env files. We merge process.env
  // (Render / CI) with the directory-loaded values, so that whichever source
  // has the key wins. This guarantees that build-time envs from the host are
  // inlined into the client bundle — Vite's default behaviour reads only from
  // .env files when called programmatically (via viteBuild()).
  const dirEnv = loadEnv(mode, path.resolve(import.meta.dirname, "client"), "VITE_");
  const procEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith("VITE_") && typeof v === "string") procEnv[k] = v;
  }
  const mergedEnv = { ...dirEnv, ...procEnv };

  // Build explicit define map so Vite replaces the identifiers at bundle time
  const defineEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(mergedEnv)) {
    defineEnv[`import.meta.env.${k}`] = JSON.stringify(v);
  }

  // Log (build logs) so future diagnostics can see whether the key made it
  if (process.env.NODE_ENV === "production") {
    const present = Object.keys(mergedEnv);
    console.log(
      `[vite-config] VITE_* keys available at build: ${present.length} (${present.join(", ") || "none"})`,
    );
  }

  return {
  customLogger: {
    ...logger,
    warn: (msg: string, options: any) => {
      if (shouldIgnoreWarning(msg)) return;
      logger.warn(msg, options);
    },
    warnOnce: (msg: string, options: any) => {
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
        manualChunks(id: string) {
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
  define: defineEnv,
  };
});
