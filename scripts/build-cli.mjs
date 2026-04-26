// @ts-check
import path from "node:path";
import { createRequire } from "node:module";
import { readdir, rm, unlink } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliRoot = path.join(root, "packages", "cli");
const requireFromCli = createRequire(path.join(cliRoot, "package.json"));
const { build } = await import(
  pathToFileURL(requireFromCli.resolve("esbuild")).href
);
const dist = path.join(cliRoot, "dist");

await rm(path.join(dist, "web"), { recursive: true, force: true });
for (const entry of await readdir(dist).catch(() => [])) {
  if (entry.endsWith(".js") || entry.endsWith(".js.map")) {
    await unlink(path.join(dist, entry));
  }
}

await build({
  entryPoints: [
    path.join(cliRoot, "src", "index.ts"),
    path.join(cliRoot, "src", "bin.ts"),
  ],
  outdir: dist,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  external: ["node:*"],
});
