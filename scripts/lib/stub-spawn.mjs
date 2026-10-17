// Loaded by NODE_OPTIONS=--import through stubSpawnEnv() in test-harness.mjs, on Windows only (#122).
// A native spawn cannot start an extensionless test stub there; this starts it through Git Bash.
import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { installStubSpawn } from "./test-harness.mjs";

installStubSpawn(cp);
syncBuiltinESMExports(); // named ESM imports of node:child_process (deps.mjs) see the wrapped functions
