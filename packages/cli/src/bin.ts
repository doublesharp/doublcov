#!/usr/bin/env node
import { run } from "./index.js";

// Bin entry: invoked when this file is executed directly as `doublcov` from
// node_modules/.bin. Excluded from unit-test coverage because vitest never
// loads this module (it imports from ./index.js). The packed-tarball smoke
// test covers it end-to-end.
await run();
