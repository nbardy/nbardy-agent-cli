import type { Harness, HarnessConfig } from '../types';
import { claudeConfig } from './claude';
import { codexConfig } from './codex';
import { opencodeConfig } from './opencode';
import { geminiConfig } from './gemini';

const geminiAliasPattern = /^gemini\d+$/;

/** Registry of all known harness configs. One entry per CLI agent. */
export const registry: Record<Harness, HarnessConfig> = {
  claude: claudeConfig,
  codex: codexConfig,
  opencode: opencodeConfig,
  gemini: geminiConfig,
};

function canonicalizeHarness(name: string): string {
  return geminiAliasPattern.test(name) ? 'gemini' : name;
}

/** Get a harness config by name. Throws on unknown harness. */
export function getHarness(name: string): HarnessConfig {
  const canonical = canonicalizeHarness(name);
  const config = registry[canonical as Harness];
  if (!config) {
    const known = Object.keys(registry).join(', ');
    throw new Error(`Unknown harness: "${name}". Known: ${known}`);
  }

  // Gemini aliases (gemini1/gemini2/gemini3) share CLI syntax but target
  // different binaries/wrappers so credentials stay isolated.
  if (name !== canonical) {
    return { ...config, binary: name };
  }

  return config;
}

/** List all known harness names. */
export function listHarnesses(): Harness[] {
  return Object.keys(registry) as Harness[];
}
