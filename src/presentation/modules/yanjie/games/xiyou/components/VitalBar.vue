<template>
  <div class="xy-vital" :class="`xy-vital--${side}`">
    <div class="xy-vital-label">{{ label }}</div>

    <!-- 气血条（毛笔笔触，朱红渐变） -->
    <div class="xy-vital-bar xy-vital-bar--hp" role="progressbar"
      :aria-label="`${label} 气血`" :aria-valuenow="hp" :aria-valuemax="maxHp">
      <div class="xy-vital-fill" :style="{ width: (hp / maxHp) * 100 + '%' }"></div>
      <span class="xy-vital-text">{{ hp }}/{{ maxHp }}</span>
    </div>

    <!-- 能量条（祥云，鎏金渐变） -->
    <div class="xy-vital-bar xy-vital-bar--en" role="progressbar"
      :aria-label="`${label} 能量`" :aria-valuenow="energy" :aria-valuemax="maxEnergy">
      <div class="xy-vital-fill" :style="{ width: (energy / maxEnergy) * 100 + '%' }"></div>
      <span class="xy-vital-text">{{ energy }}/{{ maxEnergy }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  hp: number
  maxHp: number
  energy: number
  maxEnergy: number
  side: 'player' | 'enemy'
  label: string
}>()
</script>

<style scoped lang="scss">
.xy-vital {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.xy-vital-label {
  font-family: var(--xy-font-title);
  font-size: var(--font-size-md);
  letter-spacing: 1px;
  color: var(--xy-ink-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.xy-vital-bar {
  position: relative;
  height: 16px;
  border: 1px solid var(--xy-ink-line);
  overflow: hidden;
  border-radius: 3px;
}

.xy-vital-bar--hp .xy-vital-fill {
  background: linear-gradient(90deg, var(--xy-seal), rgba(var(--rgb-brand-red), 0.45));
}

.xy-vital-bar--en .xy-vital-fill {
  background: linear-gradient(90deg, var(--xy-gold), rgba(var(--rgb-warning), 0.4));
}

.xy-vital-fill {
  height: 100%;
  transition: width var(--transition-base);
}

.xy-vital-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-xxs);
  color: var(--xy-ink-1);
  text-shadow: 0 0 4px var(--xy-paper), 0 0 4px var(--xy-paper);
}
</style>
