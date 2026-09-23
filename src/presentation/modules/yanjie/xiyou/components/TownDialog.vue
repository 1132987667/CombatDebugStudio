<template>
  <Transition name="xy-town-fade">
    <div v-if="modelValue && region?.city" ref="overlayRef" class="xy-town" role="dialog" aria-modal="true"
      :aria-label="region.city?.name" tabindex="-1" @click.self="close">
      <div class="xy-town__panel">
        <header class="xy-town__head">
          <div class="xy-town__head-text">
            <span class="xy-town__tag">城镇</span>
            <h2 class="xy-town__name">{{ region.city?.name }}</h2>
          </div>
          <button type="button" class="xy-town__close" aria-label="离开城镇" @click="close">
            <IconXClose />
          </button>
        </header>

        <p class="xy-town__loc">{{ region.name }} · {{ region.sub }}</p>
        <p class="xy-town__desc">{{ region.city?.desc }}</p>

        <section class="xy-town__section" aria-label="城内设施">
          <h3 class="xy-town__section-title">城内设施</h3>
          <ul class="xy-town__facilities">
            <li v-for="f in FACILITIES" :key="f.name" class="xy-town__facility">
              <span class="xy-town__facility-name">{{ f.name }}</span>
              <span class="xy-town__facility-desc">{{ f.desc }}</span>
              <span class="xy-town__facility-lock">未开放</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import IconXClose from '~icons/app/x-close'
import type { XiyouRegion } from '../types'

const props = defineProps<{
  modelValue: boolean
  region: XiyouRegion | null
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

/** 一域一城（PRD §24）：城镇为休整与功能枢纽，设施入口后续挂接（当前仅陈列规划） */
const FACILITIES = [
  { name: '坊市', desc: '采买物资 · 售卖战利品' },
  { name: '打造', desc: '洞府打造 · 强化装备' },
  { name: '药园', desc: '种植灵草 · 炼制丹药' },
] as const

function close(): void {
  emit('update:modelValue', false)
}

const overlayRef = ref<HTMLElement | null>(null)

watch(
  () => props.modelValue,
  open => {
    if (open) nextTick(() => overlayRef.value?.focus())
  },
)

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && props.modelValue) close()
}

window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<style scoped lang="scss">
.xy-town {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: rgba(var(--rgb-black), 0.76);
  backdrop-filter: blur(3px);
  outline: none;
}

.xy-town__panel {
  width: min(520px, 92vw);
  padding: var(--space-4) var(--space-5) var(--space-5);
  background: var(--xy-paper);
  border: 1px solid var(--xy-ink-line);
  box-shadow: 0 28px 80px rgba(var(--rgb-black), 0.65);
  border-radius: 4px;
}

.xy-town__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 2px solid var(--xy-ink-line);
}

.xy-town__head-text {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.xy-town__tag {
  font-size: var(--font-size-md);
  letter-spacing: 2px;
  color: var(--xy-gold);
}

.xy-town__name {
  margin: 0;
  font-size: var(--font-size-xxl);
  font-weight: var(--font-weight-bold);
  letter-spacing: 6px;
  color: var(--xy-ink-1);
}

.xy-town__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: transparent;
  color: var(--xy-ink-2);
  cursor: pointer;
  transition:
    border-color var(--transition-fast),
    color var(--transition-fast),
    background var(--transition-fast);

  svg {
    width: 16px;
    height: 16px;
  }

  &:hover {
    border-color: var(--xy-seal);
    color: var(--xy-seal);
    background: var(--xy-seal-soft);
  }
}

.xy-town__loc {
  margin: var(--space-2) 0 0;
  font-size: var(--font-size-md);
  letter-spacing: 1px;
  color: var(--xy-ink-4);
}

.xy-town__desc {
  margin: var(--space-2) 0 0;
  font-size: var(--font-size-md);
  line-height: var(--line-height-md);
  color: var(--xy-ink-2);
}

.xy-town__section {
  margin-top: var(--space-4);
}

.xy-town__section-title {
  margin: 0 0 var(--space-2);
  padding-left: var(--space-2);
  border-left: 3px solid var(--xy-seal);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 2px;
  color: var(--xy-ink-2);
}

.xy-town__facilities {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: var(--space-2);
}

.xy-town__facility {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px dashed var(--xy-ink-line);
  border-radius: 3px;
  background: var(--color-bg-secondary);
  opacity: 0.75;
}

.xy-town__facility-name {
  flex-shrink: 0;
  font-size: var(--font-size-lg);
  letter-spacing: 2px;
  color: var(--xy-ink-1);
}

.xy-town__facility-desc {
  flex: 1;
  min-width: 0;
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-town__facility-lock {
  flex-shrink: 0;
  padding: 0 var(--space-1);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  font-size: var(--font-size-md);
  letter-spacing: 1px;
  color: var(--xy-ink-4);
}

.xy-town-fade-enter-active {
  transition: opacity var(--transition-base);
}

.xy-town-fade-leave-active {
  transition: opacity var(--transition-fast);
}

.xy-town-fade-enter-from,
.xy-town-fade-leave-to {
  opacity: 0;
}
</style>
