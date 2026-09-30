import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * Standalone third-party embed:
 *   <script src="https://cep-demo.fybud.com/embed/webchat.js" async></script>
 *
 * Tenant is identified by which CEP host serves the script (and its baked
 * VITE_API_BASE_URL), or by data-api-base on the script tag.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiBase = env.VITE_API_BASE_URL || "http://localhost:4100";

  return {
    plugins: [react()],
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(apiBase),
    },
    build: {
      lib: {
        entry: path.resolve(__dirname, "src/embed/main.tsx"),
        name: "CepWebChat",
        formats: ["iife"],
        fileName: () => "webchat.js",
      },
      outDir: "dist/embed",
      emptyOutDir: true,
      cssCodeSplit: false,
      sourcemap: false,
      minify: true,
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
          assetFileNames: "webchat.[ext]",
        },
      },
    },
  };
});
