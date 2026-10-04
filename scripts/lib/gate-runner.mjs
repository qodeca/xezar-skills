/**
 * Runs gate commands and returns one row each (#122, #123). Users: run-gate.mjs (runGate),
 * test-guards.mjs (runPool).
 *
 * One scheduler, `runPool`, serves every job count, so "every command runs, even after one fails"
 * lives in one place. `runGate` has two output modes on it: with one job each command writes
 * straight to this terminal, exactly as a serial run always did; with more, each command's
 * stdout and stderr are kept in arrival order and printed once every command before it has
 * finished, so the output reads in config order while later commands still run. The commands get
 * `gateEnv()`: Git's tools first on PATH, and no variable that narrows a test – the gate always
 * runs every command in full.
 *
 * node:* imports and ./platform.mjs only.
 */
import { spawn } from "node:child_process";
import { msysSpawnArgs, requireGitBash, withGitTools } from "./platform.mjs";

// Variables that make a test run part of itself (scripts/lib/sections.mjs, test-deps-units.mjs).
const NARROWING = (key) => key === "XEZ_DEPS_TEST_ONLY" || key.startsWith("XEZ_SECTIONS_");

/**
 * Starts `tasks` in order on up to `jobs` lanes and resolves with their results in task order.
 * `start(task, lane)` returns a promise of one task's result; a lane runs one task at a time. A
 * task's result never stops the others: every task runs. Tasks for which `exclusive(task)` is true
 * run after every other task has finished, one at a time, with nothing else running. Throws a
 * TypeError unless `jobs` is a whole number of at least 1.
 */
export async function runPool(tasks, { jobs, start, exclusive = () => false }) {
  if (!Number.isInteger(jobs) || jobs < 1) throw new TypeError(`runPool: jobs must be a whole number of at least 1, not ${jobs}`);
  const results = new Array(tasks.length);
  const shared = [];
  const alone = [];
  tasks.forEach((task, index) => (exclusive(task) ? alone : shared).push(index));
  let next = 0;
  const lane = async (laneIndex) => {
    while (next < shared.length) {
      const index = shared[next];
      next += 1;
      results[index] = await start(tasks[index], laneIndex);
    }
  };
  const lanes = Math.max(1, Math.min(jobs, shared.length));
  await Promise.all(Array.from({ length: lanes }, (_, laneIndex) => lane(laneIndex)));
  for (const index of alone) results[index] = await start(tasks[index], 0);
  return results;
}

/** A NEW env for a gate command: withGitTools(env) without any narrowing variable (any case). */
export function gateEnv(env = process.env) {
  const next = withGitTools(env);
  for (const key of Object.keys(next)) if (NARROWING(key.toUpperCase())) delete next[key];
  return next;
}

/** A task's label and the Git Bash argv that runs it: a command string through `bash -c`, an argv as given. */
function describe(task) {
  return typeof task === "string" ? { label: task, args: ["-c", task] } : { label: task.label, args: task.argv };
}

/** Starts one task in Git Bash; resolves { exit, error } once it has ended or could not start. */
function spawnTask(args, { root, env, stdio, onChunk }) {
  return new Promise((resolve) => {
    let settled = false;
    const end = (exit, error) => {
      if (!settled) resolve({ exit, error });
      settled = true;
    };
    let child;
    try {
      child = spawn(...msysSpawnArgs(requireGitBash(), args, { cwd: root, env, stdio }));
    } catch (error) {
      end(1, error); // spawn throws, rather than emits, on some bad input (a NUL in an argument)
      return;
    }
    child.stdout?.on("data", (chunk) => onChunk("stdout", chunk));
    child.stderr?.on("data", (chunk) => onChunk("stderr", chunk));
    child.on("error", (error) => { if (child.pid === undefined) end(1, error); });
    child.on("close", (code, signal) => end(code ?? signal ?? 1, null));
  });
}

/** Writes one finished task's buffered output, between its group lines when `grouped`. */
function printSlot(slot, grouped) {
  if (grouped) process.stdout.write(`::group::${slot.label}\n`);
  for (const { stream, chunk } of slot.chunks) process[stream].write(chunk);
  if (grouped) process.stdout.write("::endgroup::\n");
}

/**
 * Runs gate tasks – command strings (`bash -c <command>`) or `{ label, argv }` (argv straight to
 * Git Bash, no shell parse) – in `root`, on `jobs` lanes. Resolves { rows, wall }: one row per
 * task in task order, { number, command, exit, seconds }, and the whole run's wall time in seconds.
 */
export async function runGate(tasks, { root, jobs = 1, env = process.env, grouped = false }) {
  const childEnv = gateEnv(env);
  const buffered = jobs > 1;
  const slots = tasks.map((task) => ({ label: describe(task).label, chunks: [], done: false }));
  let printed = 0;
  const flush = () => {
    while (printed < slots.length && slots[printed].done) printSlot(slots[printed++], grouped);
  };
  const start = async ({ task, index }) => {
    const { label, args } = describe(task);
    const slot = slots[index];
    if (grouped && !buffered) console.log(`::group::${label}`);
    const started = Date.now();
    const { exit, error } = await spawnTask(args, {
      root,
      env: childEnv,
      stdio: buffered ? ["ignore", "pipe", "pipe"] : "inherit",
      onChunk: (stream, chunk) => slot.chunks.push({ stream, chunk }),
    });
    const seconds = Math.round((Date.now() - started) / 1000);
    const failure = error ? `run-gate: ${label}: ${error.message}\n` : null;
    if (buffered) {
      if (failure) slot.chunks.push({ stream: "stderr", chunk: failure });
      slot.done = true;
      flush();
    } else {
      if (failure) process.stderr.write(failure);
      if (grouped) console.log("::endgroup::");
    }
    return { number: index + 1, command: label, exit, seconds };
  };
  const began = Date.now();
  const rows = await runPool(tasks.map((task, index) => ({ task, index })), { jobs, start });
  return { rows, wall: Math.round((Date.now() - began) / 1000) };
}
