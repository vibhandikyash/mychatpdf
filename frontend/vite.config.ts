import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./vitest.setup.ts",
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
    // Keep the suite hermetic: tests rely on a Clerk key being present
    // (the app gates auth on it) without depending on a real .env.
    env: {
      VITE_CLERK_PUBLISHABLE_KEY: "pk_test_ci_dummy",
      VITE_API_BASE_URL: "http://localhost:8000"
    }
  }
});
