import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      // Forward all Supabase API paths to the local Docker backend
      "/functions/v1": {
        target: "http://localhost:54421",
        changeOrigin: true,
        secure: false,
      },
      "/rest/v1": {
        target: "http://localhost:54421",
        changeOrigin: true,
        secure: false,
      },
      "/auth/v1": {
        target: "http://localhost:54421",
        changeOrigin: true,
        secure: false,
      },
      "/storage/v1": {
        target: "http://localhost:54421",
        changeOrigin: true,
        secure: false,
      },
      "/realtime/v1": {
        target: "http://localhost:54421",
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
