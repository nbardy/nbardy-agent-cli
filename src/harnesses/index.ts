import type { Harness, HarnessConfig } from '../types';
import { claudeConfig } from './claude';
import { codexConfig } from './codex';
import { opencodeConfig } from './opencode';
import { geminiConfig } from './gemini';

/** Registry of all known harness configs. One entry per CLI agent. */
export const registry: Record<Harness, HarnessConfig> = {
  claude: claudeConfig,
  codex: codexConfig,
  opencode: opencodeConfig,
  gemini: geminiConfig,
};

/** Get a harness config by name. Throws on unknown harness. */
export function getHarness(name: string): HarnessConfig {
  const config = registry[name as Harness];
  if (!config) {
    const known = Object.keys(registry).join(', ');
    throw new Error(`Unknown harness: "${name}". Known: ${known}`);
  }
  return config;
}

/** List all known harness names. */
export function listHarnesses(): Harness[] {
  return Object.keys(registry) as Harness[];
}
