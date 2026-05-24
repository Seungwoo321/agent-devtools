<script setup lang="ts">
import { ref } from 'vue';
import Counter from './components/Counter.vue';

const greeting = ref('agent-devtools Vue smoke');
</script>

<template>
  <main class="page">
    <h1>{{ greeting }}</h1>
    <p>
      Vite + Vue 3 host app that loads the floating widget through
      <code>@agent-devtools/vue</code>. Open the launcher in the bottom-right corner, pick the
      counter button, and the picker should resolve to the <code>Counter.vue</code> component.
    </p>
    <Counter />
  </main>
</template>

<style scoped>
.page {
  font-family:
    system-ui,
    -apple-system,
    'Segoe UI',
    sans-serif;
  max-width: 36rem;
  margin: 3rem auto;
  padding: 0 1.25rem;
  line-height: 1.5;
}
h1 {
  margin-bottom: 0.5rem;
}
</style>
