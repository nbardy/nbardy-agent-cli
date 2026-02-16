import { spawn, type ChildProcess } from 'node:child_process';
import type { BuildOptions, CommandSpec } from './types';
import { buildCommand } from './build';

/**
 * Options for runCommand — extends BuildOptions with process-level settings.
 */
export interface RunOptions extends BuildOptions {
  /** Callback for stdout data chunks. If not provided, stdout is inherited. */
  onStdout?: (data: Buffer) => void;
  /** Callback for stderr data chunks. If not provided, stderr is inherited. */
  onStderr?: (data: Buffer) => void;
}

/**
 * Result from a completed agent run.
 */
export interface RunResult {
  /** Process exit code (null if killed by signal) */
  exitCode: number | null;
  /** The CommandSpec that was executed */
  spec: CommandSpec;
}

/**
 * Spawn an agent CLI process with the correct flags and IO handling.
 *
 * This is the primary library interface. It:
 * 1. Builds the correct argv via buildCommand()
 * 2. Spawns the process
 * 3. Handles stdin delivery (write prompt + close, or just close)
 * 4. Returns a promise that resolves when the process exits
 *
 * For streaming output, pass onStdout/onStderr callbacks.
 * Without callbacks, stdout/stderr are inherited (pass through to parent).
 */
export function runCommand(harness: string, options: RunOptions = {}): {
  child: ChildProcess;
  spec: CommandSpec;
  done: Promise<RunResult>;
} {
  const spec = buildCommand(harness, options);
  const [bin, ...args] = spec.argv;

  const useCallbacks = options.onStdout || options.onStderr;

  const child = spawn(bin, args, {
    cwd: options.cwd,
    stdio: [
      'pipe',                                   // stdin: we control it
      useCallbacks ? 'pipe' : 'inherit',        // stdout
      useCallbacks ? 'pipe' : 'inherit',        // stderr
    ],
  });

  // Deliver prompt via stdin based on harness config
  if (child.stdin) {
    if (spec.stdin === 'prompt' && spec.prompt) {
      child.stdin.write(spec.prompt);
    }
    if (spec.stdin !== 'pipe') {
      child.stdin.end();
    }
  }

  // Wire up callbacks if provided
  if (options.onStdout && child.stdout) {
    child.stdout.on('data', options.onStdout);
  }
  if (options.onStderr && child.stderr) {
    child.stderr.on('data', options.onStderr);
  }

  const done = new Promise<RunResult>((resolve, reject) => {
    child.on('close', (code) => {
      resolve({ exitCode: code, spec });
    });
    child.on('error', (err) => {
      reject(err);
    });
  });

  return { child, spec, done };
}
