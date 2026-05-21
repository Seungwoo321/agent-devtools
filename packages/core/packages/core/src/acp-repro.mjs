import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { Readable, Writable } from 'node:stream';
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';

const require = createRequire(import.meta.url);
const binPath = require.resolve('@agentclientprotocol/claude-agent-acp/dist/index.js');
const cwd =
  '/Users/mzc01-swlee/dev/repository/github/Seungwoo321/agent-devtools/examples/react-vite';

console.error('[repro] binPath=', binPath);
const child = spawn(process.execPath, [binPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
});
child.stderr.on('data', (b) => process.stderr.write('[acp-stderr] ' + b.toString()));
child.on('exit', (code, sig) => console.error('[acp-exit]', code, sig));

const writable = Writable.toWeb(child.stdin);
const readable = Readable.toWeb(child.stdout);
const stream = ndJsonStream(writable, readable);

const client = {
  async sessionUpdate(n) {
    console.error('[update]', JSON.stringify(n).slice(0, 400));
  },
  async requestPermission(r) {
    console.error('[permission]', JSON.stringify(r).slice(0, 400));
    const opt =
      r.options.find((o) => o.kind === 'allow_once') ??
      r.options.find((o) => o.kind === 'allow_always');
    return {
      outcome: opt ? { outcome: 'selected', optionId: opt.optionId } : { outcome: 'cancelled' },
    };
  },
};
const conn = new ClientSideConnection(() => client, stream);

try {
  console.error('[repro] initialize...');
  const init = await conn.initialize({
    protocolVersion: PROTOCOL_VERSION,
    clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
  });
  console.error('[repro] initialize done:', JSON.stringify(init).slice(0, 300));

  console.error('[repro] newSession cwd=', cwd);
  const session = await conn.newSession({ cwd, mcpServers: [] });
  console.error('[repro] session id=', session.sessionId);

  console.error('[repro] prompt...');
  const result = await conn.prompt({
    sessionId: session.sessionId,
    prompt: [{ type: 'text', text: 'Just answer with "ok" and nothing else.' }],
  });
  console.error('[repro] result:', JSON.stringify(result).slice(0, 300));
} catch (e) {
  console.error('[repro] ERROR:', e?.stack ?? e);
} finally {
  child.kill('SIGTERM');
}
