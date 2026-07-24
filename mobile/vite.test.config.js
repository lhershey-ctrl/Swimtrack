// Test-only Vite config — same as vite.config.js, but aliases the real
// "firebase/*" packages to tests/mobile-mocks/*.js so the regression suite
// can drive the actual app UI with the network boundary faked. Never used
// for `npm run dev`/`npm run build` — only by tests/lib/mobile-harness.js.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const MOCKS = path.resolve(__dirname, "..", "tests", "mobile-mocks");

export default defineConfig({
  plugins: [react()],
  server: { port: 3099, strictPort: true },
  resolve: {
    alias: {
      "firebase/app": path.join(MOCKS, "firebase-app.js"),
      "firebase/auth": path.join(MOCKS, "firebase-auth.js"),
      "firebase/firestore": path.join(MOCKS, "firebase-firestore.js"),
    },
  },
});
