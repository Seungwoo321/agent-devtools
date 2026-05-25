<script lang="ts">
  let count = $state(0);
</script>

<div class="counter">
  <button onclick={() => (count -= 1)} aria-label="decrement">−</button>
  <span class="value">{count}</span>
  <button onclick={() => (count += 1)} aria-label="increment">+</button>
</div>

<style>
  .counter {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background: #f9fafb;
  }
  .value {
    min-width: 24px;
    text-align: center;
    font-variant-numeric: tabular-nums;
    font-size: 18px;
    font-weight: 600;
  }
  button {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid #d1d5db;
    background: white;
    cursor: pointer;
    font-size: 16px;
  }
  button:hover {
    background: #f3f4f6;
  }
</style>
