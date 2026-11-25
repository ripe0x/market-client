import { defineConfig } from "vitest/config";

// Browser transaction specs run under Playwright against a real local deployment.
export default defineConfig({ test: { include: ["**/*.test.{ts,tsx}"] } });
