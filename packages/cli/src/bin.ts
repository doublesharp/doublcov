#!/usr/bin/env node
import { run } from "./index.js";

// Bin entry: invoked when this file is executed directly as `doublcov` from
// node_modules/.bin or via the SEA single-executable. run() already catches
// all errors internally and sets process.exitCode, so we don't need
// top-level await here — and avoiding it lets the SEA build emit CJS,
// which esbuild requires (top-level await is ESM-only).
void run();
