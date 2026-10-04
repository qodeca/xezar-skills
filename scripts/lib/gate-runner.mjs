/**
 * Runs gate commands and returns one row each (#122, #123). Users: run-gate.mjs (runGate,
 * jobCount), gate-changed.mjs (runGate, jobCount: the quick local check, T0, which only chooses
 * which tasks to pass in – nothing here reads its map), test-guards.mjs (runPool),
 * test-deps-units.mjs (runPool, orderedOutput: its groups in a small pool), check-gate-map.mjs
 * (isNarrowingVariable: no committed gate command or CI job may set one).
 *
 * One scheduler, `runPool`, serves every job count, so "every command runs, even after one fails"
 * lives in one place. `runGate` has two output modes on it: with one job each command writes
 * straight to this terminal, exactly as a serial run always did; with more, each command's
 * stdout and stderr are kept in arrival order and printed once every command before it has
 * finished (`orderedOutput`), so the output reads in config order while later commands still
 * run. The commands get `gateEnv()`: Git's tools first on PATH, and no variable that narrows a
 * test – the gate always runs every command in full.
 *
 * node:* imports and ./platform.mjs only.
 */
import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import { msysSpawnArgs, requireGitBash, withGitTools } from "./platform.mjs";

/**
 * Whether an environment variable makes a test run part of itself (scripts/lib/sections.mjs,
 * test-deps-units.mjs), in any letter case. A variable that only tunes a run – a timeout, say – does
 * not narrow it.
 */
export function isNarrowingVariable(name) {
  const key = String(name).toUpperCase();
  return key === "XEZ_DEPS_TEST_ONLY" || key.startsWith("XEZ_SECTIONS_");
}
const JOBS_RANGE = "a whole number from 1 to 32";

/**
 * The job count of a gate run: `--jobs N` (its only option), else XEZ_GATE_JOBS, else the smaller
 * of 4 and this machine's CPU count. Returns { jobs }, or { error } for a usage error, which the
 * caller prints after its own name and exits 2 on.
 */
export function jobCount(argv, env) {
  const valid = (value) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 32;
  let flag = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== "--jobs") return { error: `unknown option '${argv[i]}'` };
    flag = argv[(i += 1)] ?? "";
    if (!valid(flag)) return { error: `--jobs takes ${JOBS_RANGE}` };
  }
  if (flag !== null) return { jobs: Number(flag) };
  const fromEnv = env.XEZ_GATE_JOBS ?? "";
  if (fromEnv === "") return { jobs: Math.min(4, availableParallelism()) };
  if (!valid(fromEnv)) return { error: `XEZ_GATE_JOBS takes ${JOBS_RANGE}` };
  return { jobs: Number(fromEnv) };
}

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
  for (const key of Object.keys(next)) if (isNarrowingVariable(key)) delete next[key];
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
 * The ordered printer: one slot per label, in the order output must read. `push(index, stream,
 * chunk)` keeps a task's stdout and stderr in arrival order; `done(index)` marks it finished and
 * prints every finished slot no unfinished one stands before, so output reads in slot order
 * however the tasks finish.
 */
export function orderedOutput(labels, { grouped = false } = {}) {
  const slots = labels.map((label) => ({ label, chunks: [], done: false }));
  let printed = 0;
  const flush = () => {
    while (printed < slots.length && slots[printed].done) printSlot(slots[printed++], grouped);
  };
  return {
    push(index, stream, chunk) {
      slots[index].chunks.push({ stream, chunk });
    },
    done(index) {
      slots[index].done = true;
      flush();
    },
  };
}

/**
 * Runs gate tasks – command strings (`bash -c <command>`) or `{ label, argv }` (argv straight to
 * Git Bash, no shell parse) – in `root`, on `jobs` lanes. Resolves { rows, wall }: one row per
 * task in task order, { number, command, exit, seconds }, and the whole run's wall time in seconds.
 */
export async function runGate(tasks, { root, jobs = 1, env = process.env, grouped = false }) {
  const childEnv = gateEnv(env);
  const buffered = jobs > 1;
  const output = orderedOutput(tasks.map((task) => describe(task).label), { grouped });
  const start = async ({ task, index }) => {
    const { label, args } = describe(task);
    if (grouped && !buffered) console.log(`::group::${label}`);
    const started = Date.now();
    const { exit, error } = await spawnTask(args, {
      root,
      env: childEnv,
      stdio: buffered ? ["ignore", "pipe", "pipe"] : "inherit",
      onChunk: (stream, chunk) => output.push(index, stream, chunk),
    });
    const seconds = Math.round((Date.now() - started) / 1000);
    const failure = error ? `run-gate: ${label}: ${error.message}\n` : null;
    if (buffered) {
      if (failure) output.push(index, "stderr", failure);
      output.done(index);
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
