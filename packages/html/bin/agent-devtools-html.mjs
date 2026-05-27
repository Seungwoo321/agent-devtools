#!/usr/bin/env node
import { runCli } from '../dist/index.js';

const argv = process.argv.slice(2);
const result = await runCli(argv);

if (result.exitCode !== 0) {
  process.exit(result.exitCode);
}

const shutdown = async (signal) => {
  try {
    await result.server?.close();
  } catch {
    // best-effort shutdown
  } finally {
    process.exit(signal === 'SIGINT' ? 130 : 0);
  }
};

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});
process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});
