import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig keeps JSX as "preserve" for Next; component tests need it compiled.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
