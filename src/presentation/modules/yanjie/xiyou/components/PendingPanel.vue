<template>
  <div class="xy-pending">
    <div class="xy-pending-icon" aria-hidden="true">
      <IconPendingSeal />
    </div>
    <h3 class="xy-pending-title">待 开 发 中 ....</h3>
    <p class="xy-pending-name">{{ title }}</p>
    <p class="xy-pending-sub">{{ subtitle }}</p>
    <p class="xy-pending-desc">{{ desc }}</p>
  </div>
</template>

<script setup lang="ts">
import IconPendingSeal from '~icons/app/pending-seal'
defineProps<{ title: string; subtitle: string; desc: string }>()
</script>

<style scoped lang="scss">
.xy-pending {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  gap: var(--space-2);
  color: var(--xy-ink-4);
}

.xy-pending-icon {
  width: 64px;
  height: 64px;
  margin-bottom: var(--space-3);
  opacity: 0.5;
}

.xy-pending-title {
  margin: 0;
  
  font-size: var(--font-size-xxl);
  letter-spacing: 8px;
  color: var(--xy-ink-3);
}

.xy-pending-name {
  margin: var(--space-2) 0 0;
  font-size: var(--font-size-lg);
  color: var(--xy-ink-2);
}

.xy-pending-sub {
  margin: 0;
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

.xy-pending-desc {
  margin: var(--space-2) 0 0;
  max-width: 280px;
  text-align: center;
  font-size: var(--font-size-md);
  line-height: var(--line-height-lg);
  color: var(--xy-ink-4);
}
</style>
