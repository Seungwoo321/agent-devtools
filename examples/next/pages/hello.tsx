import { useEffect } from 'react';
import { bootstrapAgentDevtools } from '@agent-devtools/next/bootstrap';

export default function HelloPage() {
  useEffect(() => {
    bootstrapAgentDevtools();
  }, []);
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Pages Router smoke</h1>
      <p>
        This route is served by the Pages Router. The same <code>bootstrapAgentDevtools</code>{' '}
        helper drives the widget on both routers.
      </p>
    </main>
  );
}
