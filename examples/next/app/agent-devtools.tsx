'use client';

import { useEffect } from 'react';
import { bootstrapAgentDevtools } from '@agent-devtools/next/bootstrap';

export function AgentDevtools() {
  useEffect(() => {
    bootstrapAgentDevtools();
  }, []);
  return null;
}
