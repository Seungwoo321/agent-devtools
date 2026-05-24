import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>agent-devtools — Next.js Pages Router example</h1>
      <p>
        This project uses only the legacy <code>pages/</code> directory. The floating widget should
        appear in the bottom-right corner during <code>next dev</code>, and the production build
        should not ship any widget-chain symbols.
      </p>
      <p>
        <Link href="/about">Go to /about</Link> — the same bootstrap helper drives every Pages
        Router route through <code>_app.tsx</code>.
      </p>
    </main>
  );
}
