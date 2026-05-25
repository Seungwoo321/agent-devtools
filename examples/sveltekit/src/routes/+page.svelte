<script lang="ts">
  import Counter from '$lib/Counter.svelte';
</script>

<main>
  <header>
    <h1>agent-devtools · SvelteKit</h1>
    <p>Hover then click any element to pick it for the agent.</p>
  </header>
  <section>
    <Counter />
  </section>
</main>

<style>
  main {
    font-family: system-ui, sans-serif;
    max-width: 640px;
    margin: 48px auto;
    padding: 0 24px;
    color: #1f2937;
  }
  header h1 {
    margin: 0 0 8px;
    font-size: 24px;
  }
  header p {
    margin: 0 0 32px;
    color: #6b7280;
  }
</style>
