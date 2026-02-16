import { execSync } from 'node:child_process';

/**
 * Cache of resolved binary paths. Module-level for process lifetime caching.
 * Key: binary name, Value: absolute path.
 */
const cache = new Map<string, string>();

/**
 * Resolve a binary name to its absolute path via `which`.
 *
 * Caches results for the process lifetime. Throws if the binary
 * is not found on PATH.
 *
 * Why: babashka's ProcessBuilder with :dir can fail to find bare
 * command names on macOS. Resolving once via `which` and using
 * the absolute path avoids this issue.
 */
export function resolveBinary(name: string): string {
  const cached = cache.get(name);
  if (cached) return cached;

  try {
    const path = execSync(`which ${name}`, { encoding: 'utf-8' }).trim();
    if (!path) throw new Error(`Empty result from which ${name}`);
    cache.set(name, path);
    return path;
  } catch {
    throw new Error(`Binary not found on PATH: ${name}`);
  }
}
