<template>
  <section class="xy-sutra" aria-label="战斗心经 · 战斗日志">
    <h3 class="xy-sutra-title">战斗心经</h3>
    <div class="xy-sutra-log" role="log" aria-live="polite">
      <p v-for="(l, i) in logs" :key="i" class="xy-sutra-line"
        :class="{ 'xy-sutra-line--key': l.emphasis }">
        <span class="xy-sutra-round">回合{{ l.round }}</span>
        {{ l.text }}
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { XiyouLog } from '../data/mock'

defineProps<{ logs: XiyouLog[] }>()
</script>

<style scoped lang="scss">
.xy-sutra {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--xy-ink-line);
  background: var(--xy-paper-warm);
  border-radius: 3px;
}

.xy-sutra-title {
  flex-shrink: 0;
  margin: 0;
  padding: var(--space-2) var(--space-4);
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  font-family: var(--xy-font-title);
  font-size: var(--font-size-md);
  letter-spacing: 3px;
  border-radius: 3px 3px 0 0;
}

.xy-sutra-log {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-3) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.xy-sutra-line {
  margin: 0;
  font-size: var(--font-size-md);
  line-height: var(--line-height-md);
  color: var(--xy-ink-2);
}

.xy-sutra-line--key {
  color: var(--xy-seal);
}

.xy-sutra-round {
  display: inline-block;
  min-width: 4em;
  color: var(--xy-ink-4);
}
</style>
