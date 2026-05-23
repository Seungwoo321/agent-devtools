import type { ReactNode } from 'react';
import { AgentDevtools } from './agent-devtools';

export const metadata = {
  title: 'agent-devtools example (Next.js)',
  description: 'End-to-end smoke for @agent-devtools/next.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <AgentDevtools />
      </body>
    </html>
  );
}
