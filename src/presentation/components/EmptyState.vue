<template>
  <div class="empty-state">
    <slot />
  </div>
</template>

<style scoped>
.empty-state {
  text-align: center;
  color: var(--color-text-tertiary);
  padding: var(--space-6);
  font-style: italic;
}
</style>
