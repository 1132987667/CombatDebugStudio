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

    <!-- 技能按钮：普攻 / 小技能 / 大招（真实释放：轮到主角时点击出手） -->
    <div class="xy-altar-skills">
      <button v-for="s in skills" :key="s.id ?? '__basic__'" type="button" class="xy-altar-skill xy-ink-hover"
        :class="[`xy-altar-skill--${s.type}`, { ready: canAct(s) }]"
        :disabled="!canAct(s)" :title="`${s.name} · ${s.desc}`" @click="castSkill(s.id)">
        <span class="xy-altar-skill-name">{{ s.name }}</span>
        <span class="xy-altar-skill-cost" v-if="s.cost > 0">{{ s.cost }} 能量</span>
        <span class="xy-altar-skill-cost" v-else>普攻</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useBattleStore } from '@/presentation/stores/battleStore'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import { PLAYER_ID } from '@/shared/constants/player'
import type { SkillConfig } from '@/domain/skill/types'

const store = useBattleStore()
const notification = useNotificationStore()

/** 切换自动战斗：真实引擎 autoPlay 开关 */
function toggleAuto(): void {
  void store.toggleAutoPlay()
}

interface SkillView {
  /** 技能 id（null = 普攻） */
  id: string | null
  name: string
  type: 'basic' | 'skill' | 'ultimate'
  cost: number
  desc: string
}

/** 主角技能面板：普攻 + 装备槽选出的已学小技能/大招（equippedPlayerSkills 已注入主角实体的 skills） */
const skills = computed<SkillView[]>(() => {
  const p = store.allyTeam.find((c) => c.id === PLAYER_ID)
  const out: SkillView[] = [{ id: null, name: '普攻', type: 'basic', cost: 0, desc: '造成 100% 攻击力伤害' }]
  if (!p) return out
  const push = (s: SkillConfig, type: SkillView['type']): void => {
    out.push({ id: s.id, name: s.name, type, cost: s.energyCost ?? 0, desc: s.description ?? '' })
  }
  for (const s of p.skills.small ?? []) push(s, 'skill')
  for (const s of p.skills.ultimate ?? []) push(s, 'ultimate')
  return out
})

/** 可出手：战斗中 + 非自动 + 轮到主角 + 存活 + 能量足够 */
function canAct(s: SkillView): boolean {
  if (!store.isBattleActive || store.autoPlayMode) return false
  if (store.currentActorId !== PLAYER_ID) return false
  const p = store.allyTeam.find((c) => c.id === PLAYER_ID)
  if (!p || p.currentHealth <= 0) return false
  return s.cost === 0 || (p.currentEnergy ?? 0) >= s.cost
}

/** 目标：优先当前选中的敌方，否则敌方首个存活单位 */
function pickTarget(): string | null {
  const sel = store.selectedCharacterId
  if (sel && store.enemyTeam.some((e) => e.id === sel && e.currentHealth > 0)) return sel
  return store.enemyTeam.find((e) => e.currentHealth > 0)?.id ?? null
}

/** 释放技能（id=null 普攻） */
async function castSkill(id: string | null): Promise<void> {
  const target = pickTarget()
  if (!target) {
    notification.toast('没有可攻击的敌人', 'error')
    return
  }
  const err = await store.executeManualAction('player', id, target)
  if (err) notification.toast(err, 'error')
}
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
