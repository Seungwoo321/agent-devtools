export default function HomePage() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>agent-devtools — Next.js example</h1>
      <p>
        This route is rendered by the App Router. The floating widget should appear in the
        bottom-right corner during <code>next dev</code>, and the production build should not ship
        any <code>@agent-devtools</code> code.
      </p>
      <p>
        See <a href="/hello">/hello</a> for the Pages Router smoke route.
      </p>
    </main>
  );
}
