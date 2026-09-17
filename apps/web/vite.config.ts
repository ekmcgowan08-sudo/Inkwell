import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // Installable-web-app support. Local-first (IndexedDB) already makes the app usable offline
    // once loaded; this adds the missing piece — a cached app shell so a reload with no network
    // still loads at all, plus "Add to Home Screen" / "Install" support. Deliberately no
    // `runtimeCaching` rules: Workbox precaches only this build's own JS/CSS/HTML/icons
    // (`generateSW`'s default), never intercepting or caching Supabase auth/API requests.
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        id: "/",
        name: "Inkwell — Writing Studio",
        short_name: "Inkwell",
        description: "An all-in-one writing studio for long-form fiction authors.",
        start_url: "/dashboard",
        display: "standalone",
        theme_color: "#1B1F2E",
        background_color: "#1B1F2E",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          tiptap: ["@tiptap/react", "@tiptap/starter-kit", "@tiptap/extension-underline", "@tiptap/extension-text-align", "@tiptap/extension-placeholder"],
          dnd: ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"],
          docx: ["docx"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
