import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: [
      { find: /^@\/core\/(.*)$/, replacement: path.resolve(__dirname, "src/core/$1") },
      { find: /^@\/niches\/(.*)$/, replacement: path.resolve(__dirname, "src/niches/$1") },
      { find: "@/niches", replacement: path.resolve(__dirname, "src/niches/index.ts") },
      { find: "@/core", replacement: path.resolve(__dirname, "src/core") },
    ],
  },
});
