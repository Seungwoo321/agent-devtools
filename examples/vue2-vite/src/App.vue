<script lang="ts">
import Vue from 'vue';
import Counter from './components/Counter.vue';

export default Vue.extend({
  name: 'App',
  components: { Counter },
  data() {
    return {
      greeting: 'agent-devtools Vue 2 smoke',
    };
  },
});
</script>

<template>
  <main class="page">
    <h1>{{ greeting }}</h1>
    <p>
      Vite + Vue 2.7 host app that loads the floating widget through
      <code>@agent-devtools/vue2</code>. Open the launcher in the bottom-right corner, pick the
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
