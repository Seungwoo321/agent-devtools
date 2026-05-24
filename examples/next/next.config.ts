import type { NextConfig } from 'next';
import { withAgentDevtools } from '@agent-devtools/next';

const baseConfig: NextConfig = {
  reactStrictMode: true,
};

export default withAgentDevtools(baseConfig, {
  baseUrl: process.env.AGENT_DEVTOOLS_BASE_URL ?? 'http://127.0.0.1:4317',
  pairingToken: process.env.AGENT_DEVTOOLS_PAIRING_TOKEN ?? 'example-token',
});
