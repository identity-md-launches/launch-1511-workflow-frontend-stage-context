import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "runtime-deployment-for-local-development",
      configureServer(server) {
        // Development uses the same committed manifest and ABI files as production.
        server.middlewares.use(async (req, res, next) => {
          const path = req.url?.split("?")[0] ?? "";
          if (
            path !== "/imd-deployment.json" &&
            !/^\/abi\/[A-Za-z0-9]+\.json$/.test(path)
          )
            return next();
          try {
            const bytes = await readFile(
              new URL(`../dist${path}`, import.meta.url),
            );
            res.setHeader("Content-Type", "application/json");
            res.end(bytes);
          } catch {
            res.statusCode = 503;
            res.end("Build the static export with npm run build first.");
          }
        });
      },
    },
  ],
  build: { outDir: "../dist", emptyOutDir: true, sourcemap: false },
  server: { host: "127.0.0.1" },
  preview: { host: "127.0.0.1" },
});
