<script setup lang="ts">
import { ref } from 'vue';

const count = ref(0);
</script>

<template>
  <section class="counter">
    <p>Count: {{ count }}</p>
    <button type="button" @click="count++">Increment</button>
  </section>
</template>

<style scoped>
.counter {
  display: flex;
  align-items: center;
  gap: 1rem;
}
button {
  padding: 0.4rem 0.9rem;
  border-radius: 6px;
  border: 1px solid #888;
  background: #fafafa;
  cursor: pointer;
}
</style>
