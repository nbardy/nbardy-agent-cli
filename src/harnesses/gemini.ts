import type { HarnessConfig } from '../types';

/**
 * Gemini CLI harness config.
 *
 * Session management:
 *   Implicit — Gemini manages sessions by working directory.
 *   Resume: --resume latest (always, regardless of session ID)
 *
 * Permissions:
 *   --yolo bypasses all confirmation prompts.
 */
export const geminiConfig: HarnessConfig = {
  binary: 'gemini',
  baseCmd: [],
  bypassFlags: ['--yolo'],
  modelFlag: '-m',
  promptVia: 'flag',
  promptFlag: '-p',
  stdin: 'close',
  stdout: 'jsonl',
  extraArgs: ['--output-format', 'stream-json'],

  // Gemini resumes by CWD, not by session ID. --resume latest picks up
  // the most recent session in the current directory.
  sessionResumeFlags: (_id) => ['--resume', 'latest'],
};
