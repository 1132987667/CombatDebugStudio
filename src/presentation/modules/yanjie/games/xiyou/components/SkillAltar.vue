<template>
  <div class="xy-altar">
    <!-- 自动战斗开关（联动 battleStore 真实引擎） -->
    <button type="button" class="xy-altar-auto xy-ink-hover" :class="{ on: store.autoPlayMode }"
      :aria-pressed="store.autoPlayMode" @click="toggleAuto">
      <svg viewBox="0 0 24 24" class="xy-altar-auto-icon" aria-hidden="true">
        <path d="M6 4l14 8-14 8V4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
      </svg>
      <span class="xy-altar-auto-label">自动</span>
    </button>

    <!-- 技能按钮：普攻 / 小技能 / 大招 -->
    <div class="xy-altar-skills">
      <button v-for="s in skills" :key="s.name" type="button" class="xy-altar-skill xy-ink-hover"
        :class="[`xy-altar-skill--${s.type}`, { ready: s.ready }]"
        :title="`${s.name} · ${s.desc}`">
        <span class="xy-altar-skill-name">{{ s.name }}</span>
        <span class="xy-altar-skill-cost" v-if="s.cost > 0">{{ s.cost }} 能量</span>
        <span class="xy-altar-skill-cost" v-else>普攻</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useBattleStore } from '@/presentation/stores/battleStore'

const store = useBattleStore()

/** 切换自动战斗：真实引擎 autoPlay 开关 */
function toggleAuto(): void {
  void store.toggleAutoPlay()
}

/** 框架展示用技能按钮（能量充足与否由 ready 表达样式） */
const skills = [
  { name: '普攻', type: 'basic', cost: 0, desc: '造成 100% 攻击力伤害', ready: true },
  { name: '破甲斩', type: 'skill', cost: 50, desc: '120% 伤害，无视 30% 防御', ready: true },
  { name: '疾风步', type: 'skill', cost: 50, desc: '提升 30% 速度，持续 3 回合', ready: true },
  { name: '齐天战意', type: 'ultimate', cost: 150, desc: '提升 50% 攻击力和 30% 暴击率，持续 5 回合', ready: false },
] as const
</script>

<style scoped lang="scss">
.xy-altar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding: var(--space-4) 0;
  margin-bottom: var(--space-4);
  border-bottom: 1px solid var(--xy-ink-line);
}

.xy-altar-auto {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-3);
  border: 1px solid var(--xy-ink-line);
  border-radius: 50%;
  background: var(--xy-paper);
  color: var(--xy-ink-3);
  cursor: pointer;

  &.on {
    border-color: var(--xy-gold);
    color: var(--xy-gold);
    box-shadow: 0 0 8px var(--xy-gold-soft);
  }
}

.xy-altar-auto-icon {
  width: 22px;
  height: 22px;
}

.xy-altar-auto-label {
  font-size: var(--font-size-md);
}

.xy-altar-skills {
  display: flex;
  gap: var(--space-3);
  align-items: center;
}

.xy-altar-skill {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  min-width: 72px;
  padding: var(--space-3) var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: var(--radius-sm);
  background: var(--xy-paper-warm);
  cursor: pointer;
  font-family: inherit;

  &:hover {
    border-color: var(--xy-ink-2);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  &.xy-altar-skill--basic {
    border-color: var(--xy-jade);
  }

  &.xy-altar-skill--skill {
    border-color: var(--color-skill-active);
    background: rgba(var(--rgb-skill-active), var(--alpha-wash));
  }

  &.xy-altar-skill--ultimate {
    border-color: var(--xy-seal);
    background: var(--xy-seal-soft);
  }

  &.ready.xy-altar-skill--ultimate {
    animation: xy-ult-glow 2s ease-in-out infinite;
  }
}

.xy-altar-skill-name {
  font-size: var(--font-size-md);
  color: var(--xy-ink-1);
}

.xy-altar-skill-cost {
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

@keyframes xy-ult-glow {
  0%,
  100% {
    box-shadow: 0 0 0 var(--xy-gold-soft);
  }

  50% {
    box-shadow: 0 0 10px var(--xy-gold-soft);
  }
}
</style>
