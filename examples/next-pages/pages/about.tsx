import Link from 'next/link';

export default function AboutPage() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>About</h1>
      <p>
        A second Pages Router route, served from <code>pages/about.tsx</code>. The bootstrap helper
        already ran from <code>_app.tsx</code> on the first render, so the widget persists across
        client-side navigations without re-mounting.
      </p>
      <p>
        <Link href="/">Back to home</Link>
      </p>
    </main>
  );
}
