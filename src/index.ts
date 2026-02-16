/**
 * @nbardy/agent-cli — Shared CLI agent invocation tool.
 *
 * Single source of truth for how to invoke Claude, Codex, OpenCode, Gemini CLIs.
 * Both oompa_loompas (Clojure, shells out to CLI) and claude-web-view
 * (TypeScript, imports this library) consume this package.
 *
 * Usage (library — run):
 *   import { runCommand } from '@nbardy/agent-cli';
 *   const { done } = runCommand('claude', { model: 'opus', prompt: 'hello', sessionId: 'abc' });
 *   const { exitCode } = await done;
 *
 * Usage (library — build only):
 *   import { buildCommand } from '@nbardy/agent-cli';
 *   const spec = buildCommand('claude', { model: 'opus', prompt: 'hello', sessionId: 'abc' });
 *
 * Usage (CLI):
 *   agent-cli run --harness claude --model opus --prompt "hello" --session abc
 */

export type {
  Harness,
  HarnessConfig,
  BuildOptions,
  CommandSpec,
  PromptDelivery,
  StdinBehavior,
} from './types';

export { buildCommand } from './build';
export { runCommand } from './run';
export type { RunOptions, RunResult } from './run';
export { getHarness, listHarnesses, registry } from './harnesses';
export { resolveBinary } from './resolve';
