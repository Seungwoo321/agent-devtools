import { useEffect } from 'react';
import { bootstrapAgentDevtools } from '@agent-devtools/next-pages/bootstrap';
import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    bootstrapAgentDevtools();
  }, []);
  return <Component {...pageProps} />;
}
