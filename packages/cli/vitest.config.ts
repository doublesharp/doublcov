import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    coverage: {
      // bin.ts is the published binary entry point: it just calls run() from
      // index.ts. Vitest never imports it (tests import from index.ts), so
      // there is no useful coverage signal here. The packed-tarball smoke
      // test exercises the bin end-to-end.
      exclude: ["src/bin.ts"],
    },
  },
});
