import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { executeCommand, type UnifiedAgentEvent } from '../src/run';

function writeCodexShim(binDir: string): void {
  const shimPath = path.join(binDir, 'codex');
  const shimSource = `#!/usr/bin/env node
const args = process.argv.slice(2);
const sep = args.indexOf('--');
const prompt = sep >= 0 ? (args[sep + 1] ?? '') : '';
const emit = (obj) => process.stdout.write(JSON.stringify(obj) + '\\n');

if (prompt === 'contract-success') {
  emit({ type: 'thread.started', thread_id: 'thread-final' });
  emit({ type: 'turn.started' });
  emit({ type: 'item.completed', item: { type: 'agent_message', text: 'hello' } });
  emit({ type: 'turn.completed' });
  process.exit(0);
}

if (prompt === 'contract-no-complete') {
  emit({ type: 'thread.started', thread_id: 'thread-no-complete' });
  process.exit(7);
}

if (prompt === 'contract-missing-terminal-success-exit') {
  emit({ type: 'thread.started', thread_id: 'thread-missing-terminal' });
  emit({ type: 'turn.started' });
  emit({ type: 'item.completed', item: { type: 'agent_message', text: 'partial' } });
  process.exit(0);
}

if (prompt === 'flag-check') {
  emit({ type: 'thread.started', thread_id: 'thread-resume' });
  process.exit(0);
}

process.exit(0);
`;

  writeFileSync(shimPath, shimSource);
  chmodSync(shimPath, 0o755);
}

async function collectEvents(events: AsyncIterable<UnifiedAgentEvent>): Promise<UnifiedAgentEvent[]> {
  const out: UnifiedAgentEvent[] = [];
  for await (const event of events) {
    out.push(event);
  }
  return out;
}

describe('executeCommand contract', { concurrency: 1 }, () => {
  const originalPath = process.env.PATH ?? '';
  let tempRoot = '';
  let workspace = '';

  before(() => {
    tempRoot = mkdtempSync(path.join(tmpdir(), 'agent-cli-run-test-'));
    workspace = path.join(tempRoot, 'workspace');
    mkdirSync(workspace, { recursive: true });
    writeCodexShim(tempRoot);
    process.env.PATH = `${tempRoot}:${originalPath}`;
  });

  after(() => {
    process.env.PATH = originalPath;
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('resolves final session id consistently across events, sessionId, and completed', async () => {
    const turn = executeCommand({
      harness: 'codex',
      mode: 'conversation',
      prompt: 'contract-success',
      cwd: workspace,
      model: 'gpt-5.3-codex',
      resumeSessionId: 'resume-thread',
      yolo: false,
    });

    const eventsPromise = collectEvents(turn.events);
    const completion = await turn.completed;
    const events = await eventsPromise;
    const resolvedSessionId = await turn.sessionId;

    assert.strictEqual(completion.reason, 'success');
    assert.strictEqual(completion.exitCode, 0);
    assert.strictEqual(completion.sessionId, 'thread-final');
    assert.strictEqual(resolvedSessionId, 'thread-final');

    const sessionEvents: string[] = [];
    let turnStartedCount = 0;
    const completionReasons: string[] = [];
    let sawHelloDelta = false;
    for (const event of events) {
      if (event.type === 'session.started') sessionEvents.push(event.sessionId);
      if (event.type === 'turn.started') turnStartedCount += 1;
      if (event.type === 'turn.complete') completionReasons.push(event.reason);
      if (event.type === 'text.delta' && event.text === 'hello') sawHelloDelta = true;
    }

    assert.deepStrictEqual(sessionEvents, ['resume-thread', 'thread-final']);
    assert.strictEqual(turnStartedCount, 1);
    assert.deepStrictEqual(completionReasons, ['success']);
    assert.ok(sawHelloDelta, 'expected assistant text delta from codex JSON stream');
  });

  it('falls back to error completion when process exits non-zero without terminal event', async () => {
    const turn = executeCommand({
      harness: 'codex',
      mode: 'conversation',
      prompt: 'contract-no-complete',
      cwd: workspace,
      model: 'gpt-5.3-codex',
      yolo: false,
    });

    const eventsPromise = collectEvents(turn.events);
    const completion = await turn.completed;
    const events = await eventsPromise;
    const resolvedSessionId = await turn.sessionId;

    assert.strictEqual(completion.reason, 'error');
    assert.strictEqual(completion.exitCode, 7);
    assert.strictEqual(completion.sessionId, 'thread-no-complete');
    assert.strictEqual(resolvedSessionId, 'thread-no-complete');

    const completionReasons = events
      .filter((event): event is Extract<UnifiedAgentEvent, { type: 'turn.complete' }> => event.type === 'turn.complete')
      .map((event) => event.reason);
    assert.deepStrictEqual(completionReasons, ['error']);
  });

  it('treats conversation exit without turn.complete as error even with exit code 0', async () => {
    const turn = executeCommand({
      harness: 'codex',
      mode: 'conversation',
      prompt: 'contract-missing-terminal-success-exit',
      cwd: workspace,
      model: 'gpt-5.3-codex',
      yolo: false,
    });

    const eventsPromise = collectEvents(turn.events);
    const completion = await turn.completed;
    const events = await eventsPromise;
    const resolvedSessionId = await turn.sessionId;

    assert.strictEqual(completion.reason, 'error');
    assert.strictEqual(completion.exitCode, 0);
    assert.strictEqual(completion.sessionId, 'thread-missing-terminal');
    assert.strictEqual(resolvedSessionId, 'thread-missing-terminal');

    const completionReasons = events
      .filter((event): event is Extract<UnifiedAgentEvent, { type: 'turn.complete' }> => event.type === 'turn.complete')
      .map((event) => event.reason);
    assert.deepStrictEqual(completionReasons, ['error']);

    const errors = events
      .filter((event): event is Extract<UnifiedAgentEvent, { type: 'error' }> => event.type === 'error')
      .map((event) => event.message);
    assert.ok(
      errors.some((message) => message.includes('without a terminal turn.complete event')),
      `expected missing-terminal error message; got: ${JSON.stringify(errors)}`
    );
  });

  it('uses --full-auto for codex resume without adding dangerous bypass flag', async () => {
    const turn = executeCommand({
      harness: 'codex',
      mode: 'conversation',
      prompt: 'flag-check',
      cwd: workspace,
      model: 'gpt-5.3-codex',
      resumeSessionId: 'thread-resume',
      yolo: true,
      fullAuto: true,
    });

    assert.strictEqual(turn.spec.argv[0], 'codex');
    assert.strictEqual(turn.spec.argv[1], 'exec');
    assert.strictEqual(turn.spec.argv[2], 'resume');
    assert.strictEqual(turn.spec.argv[3], 'thread-resume');
    assert.ok(turn.spec.argv.includes('--full-auto'));
    assert.ok(turn.spec.argv.includes('--json'));
    assert.ok(!turn.spec.argv.includes('--dangerously-bypass-approvals-and-sandbox'));

    await turn.completed;
  });
});
