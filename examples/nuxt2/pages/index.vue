<template>
  <main class="page">
    <h1>{{ greeting }}</h1>
    <p>
      Nuxt 2 host app that loads the floating widget through
      <code>@agent-devtools/nuxt2</code> (which mounts the Vue 2 adapter on the first client
      render). Open the launcher in the bottom-right corner, pick the counter button, and the picker
      should resolve to the <code>Counter.vue</code> component.
    </p>
    <Counter />
  </main>
</template>

<script>
import Counter from '~/components/Counter.vue';

export default {
  name: 'IndexPage',
  components: { Counter },
  data() {
    return {
      greeting: 'agent-devtools Nuxt 2 smoke',
    };
  },
};
</script>

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
