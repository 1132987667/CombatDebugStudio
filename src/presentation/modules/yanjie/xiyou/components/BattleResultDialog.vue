<template>
  <Transition name="xy-result-fade">
    <div v-if="modelValue" class="xy-result-dlg" role="dialog" aria-modal="true"
      aria-label="战斗结算" @click.self="close">
      <div class="xy-result-dlg__panel" :class="`xy-result-dlg__panel--${result?.victory ? 'win' : 'lose'}`">
        <header class="xy-result-dlg__head">
          <h2 class="xy-result-dlg__title">{{ result?.victory ? '降 妖 得 胜' : '铩 羽 而 归' }}</h2>
          <p class="xy-result-dlg__sub">
            {{ result?.victory ? '妖邪尽诛，战利品入囊。' : '此战失利，重整旗鼓再战。' }}
          </p>
          <button type="button" class="xy-result-dlg__close" aria-label="关闭结算" @click="close">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </button>
        </header>

        <div class="xy-result-dlg__body">
          <template v-if="result?.victory">
            <div class="xy-result-dlg__rewards">
              <div class="xy-result-dlg__reward xy-result-dlg__reward--gold">
                <span class="xy-result-dlg__reward-label">铜钱</span>
                <span class="xy-result-dlg__reward-value">+{{ result.gold }}</span>
              </div>
              <div class="xy-result-dlg__reward xy-result-dlg__reward--exp">
                <span class="xy-result-dlg__reward-label">经验</span>
                <span class="xy-result-dlg__reward-value">+{{ result.exp }}</span>
              </div>
              <div v-if="result.leveled > 0" class="xy-result-dlg__reward xy-result-dlg__reward--level">
                <span class="xy-result-dlg__reward-label">等级</span>
                <span class="xy-result-dlg__reward-value">Lv.{{ result.leveled }}↑</span>
              </div>
            </div>

            <section v-if="result.drops.length" class="xy-result-dlg__section">
              <h4 class="xy-result-dlg__section-title">获得物品</h4>
              <div class="xy-result-dlg__drops">
                <span v-for="d in result.drops" :key="d.itemId" class="xy-result-dlg__drop">
                  {{ d.name }}<template v-if="d.quantity > 1">×{{ d.quantity }}</template>
                </span>
              </div>
            </section>
          </template>
          <p v-else class="xy-result-dlg__fail-hint">经验与掉落不结算，背包中无损失。</p>
        </div>

        <footer class="xy-result-dlg__actions">
          <button type="button" class="xy-result-dlg__btn xy-result-dlg__btn--primary" @click="close">
            返回关卡
          </button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import type { BattleResultData } from './BattleZen.vue'

const props = defineProps<{
  modelValue: boolean
  result: BattleResultData | null
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function close(): void {
  emit('update:modelValue', false)
}
</script>

<style scoped lang="scss">
.xy-result-dlg {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: rgba(var(--rgb-black), 0.72);
  backdrop-filter: blur(3px);
}

.xy-result-dlg__panel {
  display: flex;
  flex-direction: column;
  width: min(420px, 92vw);
  max-height: 80vh;
  background: var(--xy-paper);
  border: 1px solid var(--xy-ink-line);
  border-top: 3px solid var(--xy-jade);
  box-shadow: 0 24px 64px rgba(var(--rgb-black), 0.6);
  border-radius: 4px;
  overflow: hidden;

  &--lose {
    border-top-color: var(--color-debuff);
  }
}

.xy-result-dlg__head {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--xy-ink-line);
  background: linear-gradient(180deg, var(--color-bg-tertiary), var(--xy-paper));
}

.xy-result-dlg__title {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  letter-spacing: 6px;
  color: var(--xy-ink-1);
}

.xy-result-dlg__sub {
  margin: 0;
  font-size: var(--font-size-md);
  letter-spacing: 1px;
  color: var(--xy-ink-3);
}

.xy-result-dlg__close {
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: transparent;
  color: var(--xy-ink-2);
  cursor: pointer;

  svg {
    width: 15px;
    height: 15px;
  }

  &:hover {
    border-color: var(--xy-seal);
    color: var(--xy-seal);
  }
}

.xy-result-dlg__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-4) var(--space-5);
}

.xy-result-dlg__rewards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
}

.xy-result-dlg__reward {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: var(--space-3) var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: 3px;
  background: var(--color-bg-secondary);

  &--gold .xy-result-dlg__reward-value {
    color: var(--xy-gold);
  }

  &--exp .xy-result-dlg__reward-value {
    color: var(--xy-jade);
  }

  &--level .xy-result-dlg__reward-value {
    color: var(--color-skill-active);
  }
}

.xy-result-dlg__reward-label {
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

.xy-result-dlg__reward-value {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--xy-ink-1);
}

.xy-result-dlg__section {
  margin-top: var(--space-4);
}

.xy-result-dlg__section-title {
  margin: 0 0 var(--space-2);
  padding-left: var(--space-2);
  border-left: 3px solid var(--xy-seal);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 2px;
  color: var(--xy-ink-2);
}

.xy-result-dlg__drops {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.xy-result-dlg__drop {
  padding: 2px var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: var(--radius-full);
  background: var(--xy-paper-warm);
  color: var(--xy-ink-2);
  font-size: var(--font-size-md);
}

.xy-result-dlg__fail-hint {
  margin: 0;
  padding: var(--space-4);
  text-align: center;
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-result-dlg__actions {
  display: flex;
  padding: var(--space-3) var(--space-5);
  border-top: 1px dashed var(--xy-ink-line);
}

.xy-result-dlg__btn {
  flex: 1;
  padding: var(--space-2) var(--space-3);
  border-radius: 2px;
  cursor: pointer;
  font-family: inherit;
  font-size: var(--font-size-md);
  letter-spacing: 3px;

  &--primary {
    border: 1px solid var(--xy-seal);
    background: var(--xy-seal);
    color: #fff;

    &:hover {
      background: var(--xy-seal);
    }
  }
}

.xy-result-fade-enter-active {
  transition: opacity var(--transition-base);
}

.xy-result-fade-leave-active {
  transition: opacity var(--transition-fast);
}

.xy-result-fade-enter-from,
.xy-result-fade-leave-to {
  opacity: 0;
}
</style>
