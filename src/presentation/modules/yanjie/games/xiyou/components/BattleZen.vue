<template>
  <main class="xy-battle xy-panel" aria-label="战斗禅台">
    <!-- 顶部：场景与敌情 -->
    <header class="xy-battle-head">
      <h2 class="xy-battle-scene">{{ scene.name }}</h2>
      <p class="xy-battle-meta">难度：{{ difficultyText(scene.difficulty) }} ｜ {{ scene.range }}</p>
      <div class="xy-battle-scale" aria-label="战斗规模">
        <span class="xy-battle-scale-tag xy-battle-scale-tag--player">我方 {{ store.allyTeam.length }} 人</span>
        <span class="xy-battle-scale-vs">斗</span>
        <span class="xy-battle-scale-tag xy-battle-scale-tag--enemy">敌方 {{ store.enemyTeam.length }} 人</span>
      </div>
      <div class="xy-enemy-bubbles" role="list" aria-label="可能出现的敌人">
        <span v-for="e in scene.enemies" :key="e.name" class="xy-enemy-bubble xy-ink-hover" role="listitem">
          <span class="xy-enemy-name">{{ e.name }}</span>
          <span class="xy-enemy-level">[{{ e.level }}]</span>
        </span>
      </div>
    </header>

    <!-- 中上部：4v4 角色卡片（敌方一行 / 我方一行，演武台同款 ParticipantCard） -->
    <div class="xy-vitals">
      <div class="xy-vitals-row xy-vitals-row--enemy" role="list" aria-label="敌方阵容">
        <ParticipantCard v-for="c in store.enemyTeam" :key="c.id" :ref="(el) => handleCardRef(c.id, el)"
          :participant="c" :is-active="isCurrentActor(c.id)"
          :is-selected="store.selectedCharacterId === c.id" :is-enemy="true"
          :turn-tick="store.currentTurn" @click="selectCharacter(c.id)" />
      </div>

      <span class="xy-vs" aria-hidden="true">斗</span>

      <div class="xy-vitals-row xy-vitals-row--player" role="list" aria-label="我方阵容">
        <ParticipantCard v-for="c in store.allyTeam" :key="c.id" :ref="(el) => handleCardRef(c.id, el)"
          :participant="c" :is-active="isCurrentActor(c.id)"
          :is-selected="store.selectedCharacterId === c.id" :is-enemy="false"
          :turn-tick="store.currentTurn" @click="selectCharacter(c.id)" />
      </div>
    </div>

    <!-- 战况状态行：回合 / 行动顺序 / 生效状态 -->
    <div class="xy-battle-status">
      <div class="xy-battle-status-row">
        <span class="xy-battle-round">第 {{ store.currentTurn }} 回合</span>
        <span class="xy-chip" :class="store.autoPlayMode ? 'xy-chip--gold' : 'xy-chip--muted'">
          {{ store.autoPlayMode ? '自动战斗 · 已开启' : '自动战斗 · 待命' }}
        </span>
      </div>
      <div class="xy-battle-order" role="img" aria-label="行动顺序">
        <span class="xy-order-tag xy-order-tag--player">我方先锋 {{ leadPlayer?.name ?? '—' }} · 速 {{ leadPlayer?.getAttribute(ATTRIBUTE_CODE.speed) ?? 0 }}</span>
        <span class="xy-order-bar"><span class="xy-order-bar-fill" :style="orderFillStyle"></span></span>
        <span class="xy-order-tag xy-order-tag--enemy">敌方先锋 {{ leadEnemy?.name ?? '—' }} · 速 {{ leadEnemy?.getAttribute(ATTRIBUTE_CODE.speed) ?? 0 }}</span>
      </div>
      <div class="xy-battle-buffs">
        <span v-for="b in battleBuffs" :key="b.name" class="xy-buff-tag" :class="`xy-buff-tag--${b.kind}`">
          {{ b.name }}
        </span>
      </div>
    </div>

    <!-- 中部：技能灵台 -->
    <div class="xy-battle-zen-row">
      <SkillAltar />
      <button type="button" class="xy-battle-pack xy-ink-hover" aria-label="打开行囊" @click="quickOpen = true">
        <svg viewBox="0 0 24 24" class="xy-battle-pack-icon" aria-hidden="true">
          <path d="M5 8h14v11H5zM5 8c0-2.2 1.8-4 4-4h6c2.2 0 4 1.8 4 4M9 12h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="xy-battle-pack-label">行囊</span>
      </button>
    </div>

    <!-- 战斗快捷栏浮层 -->
    <QuickSlotBar v-model="quickOpen" />

    <!-- 底部：战斗心经（消费唤灵台同源 battleLogManager） -->
    <BattleSutra />

    <!-- 战斗视觉特效层（演武台同款） -->
    <BattleVisualEffects ref="visualEffectsRef" />
  </main>
</template>

<script setup lang="ts">
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { ActionTypes, ActionResultType, ParticipantSide } from '@/domain/battle/type/types'
import { BattleEventCodes, type BattleEndedEventData } from '@/domain/battle/type/BattleEventType'
import type { BattleService } from '@/application/facade/BattleFacade'
import { container } from '@/infrastructure/di/Container'
import BattleVisualEffects from '@/presentation/components/BattleVisualEffects.vue'
import ParticipantCard from '@/presentation/components/ParticipantCard.vue'
import { useBattleAnimation } from '@/presentation/composables/useBattleAnimation'
import { useBattleStore } from '@/presentation/stores/battleStore'
import { usePackStore } from '@/presentation/stores/packStore'
import { BATTLE_ANIMATION_TIMING, getActionBudget } from '@/shared/constants/animation-timing'
import { getVisualEffect } from '@/shared/utils/visual-effect-mapper'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { buildBattleTeams, dropsForScene, type XiyouScene } from '../data/mock'
import BattleSutra from './BattleSutra.vue'
import QuickSlotBar from './QuickSlotBar.vue'
import SkillAltar from './SkillAltar.vue'

const props = defineProps<{ scene: XiyouScene }>()

const store = useBattleStore()
const battleService = container.resolve<BattleService>('BattleService')

/** 战斗快捷栏浮层开关 */
const quickOpen = ref(false)

// ════════════ 动画与特效（演武台同款接线） ════════════
const visualEffectsRef = ref<InstanceType<typeof BattleVisualEffects> | null>(null)
const participantCardRefs = ref<Record<string, InstanceType<typeof ParticipantCard>>>({})

const {
  registerElement,
  unregisterElement,
  playAttackAnimation,
  playHitAnimation,
  playBuffAnimation,
  setBattleSpeed,
  stopAllAnimations,
} = useBattleAnimation()

watch(() => store.battleSpeed, (v) => v && setBattleSpeed(v), { immediate: true })

function handleCardRef(characterId: string, el: InstanceType<typeof ParticipantCard> | null | unknown): void {
  const card = el as InstanceType<typeof ParticipantCard> | null
  if (card) {
    participantCardRefs.value[characterId] = card
    registerElement(characterId, card.cardRef as HTMLElement | null)
    if (card.cardRef) {
      visualEffectsRef.value?.registerCard(characterId, card.cardRef as HTMLElement)
    }
  } else {
    delete participantCardRefs.value[characterId]
    unregisterElement(characterId)
    visualEffectsRef.value?.unregisterCard(characterId)
  }
}

watch(visualEffectsRef, (vf) => {
  if (!vf) return
  for (const [id, card] of Object.entries(participantCardRefs.value)) {
    if (card.cardRef) vf.registerCard(id, card.cardRef as HTMLElement)
  }
}, { immediate: true })

let lastSkillKey = ''

// ponytail: 固定预算模型 — 动画编排完全由领域层配速驱动（与唤灵台 BattleField 同款）
watch(store.animationState, (state) => {
  const budget = getActionBudget(store.battleSpeed)
  const skill = state.skill
  if (skill?.sourceId) {
    const key = `${skill.sourceId}|${skill.targetId}|${skill.skillName}`
    if (key === lastSkillKey) return
    lastSkillKey = key

    const card = participantCardRefs.value[skill.sourceId]
    card?.triggerVisualState('casting', budget * BATTLE_ANIMATION_TIMING.PHASES.windup.end)
    const side = getCharacterSide(skill.sourceId)
    void playAttackAnimation(skill.sourceId, side, skill.skillName, budget)
    const isHeal = skill.effectType === ActionTypes.HEAL
    const visual = getVisualEffect(skill.damageCategory, isHeal)
    const impact = visual.impactClass === 'fire' || visual.impactClass === 'frost' ? visual.impactClass : 'fire'
    visualEffectsRef.value?.playFlightSequence(
      skill.sourceId, skill.targetId, skill.skillName,
      side as 'left' | 'right', impact, budget,
    )
  }
  if (state.damage) {
    const targetCard = participantCardRefs.value[state.damage.targetId]
    if (state.damage.isHeal) {
      targetCard?.triggerVisualState('healed', budget * 0.4)
      targetCard?.flashHpBar(budget)
      visualEffectsRef.value?.showHealAura(state.damage.targetId, budget)
      visualEffectsRef.value?.showHealNum(state.damage.targetId, state.damage.damage, budget)
    } else {
      targetCard?.triggerVisualState('hurt', budget * 0.4)
      visualEffectsRef.value?.showImpact(state.damage.targetId, 'fire', budget)
      visualEffectsRef.value?.showDamageNum(state.damage.targetId, state.damage.damage, state.damage.isCritical, budget)
      if (state.damage.isCritical) {
        visualEffectsRef.value?.showScreenShake()
      }
    }
  }
  if (state.miss) {
    visualEffectsRef.value?.showMissText(state.miss.targetId, budget)
    playHitAnimation(state.miss.targetId, { hitEffect: ActionResultType.MISS })
  }
  if (state.buff) {
    const buffDuration = budget * BATTLE_ANIMATION_TIMING.PHASES.settle.start
    playBuffAnimation(state.buff.targetId, state.buff.isPositive)
    if (state.buff.isPositive) {
      participantCardRefs.value[state.buff.targetId]?.triggerVisualState('shielded', buffDuration)
    }
  }
}, { deep: true })

// ════════════ 数据派生 ════════════
const leadPlayer = computed(() => [...store.allyTeam].sort((a, b) => b.getAttribute(ATTRIBUTE_CODE.speed) - a.getAttribute(ATTRIBUTE_CODE.speed))[0])
const leadEnemy = computed(() => [...store.enemyTeam].sort((a, b) => b.getAttribute(ATTRIBUTE_CODE.speed) - a.getAttribute(ATTRIBUTE_CODE.speed))[0])

const orderFillStyle = computed(() => {
  const max = Math.max(leadPlayer.value?.getAttribute(ATTRIBUTE_CODE.speed) ?? 0, leadEnemy.value?.getAttribute(ATTRIBUTE_CODE.speed) ?? 0, 1)
  const pct = Math.round((leadPlayer.value?.getAttribute(ATTRIBUTE_CODE.speed) ?? 0) / max * 82)
  return { width: pct + '%' }
})

/** 生效状态（由引擎 Buff 派生，缺省兜底静态） */
const battleBuffs = computed(() => {
  const list: Array<{ name: string; kind: 'atk' | 'spd' | 'debuff' }> = []
  for (const p of [...store.allyTeam, ...store.enemyTeam]) {
    const buffIds = p.getBuffInstanceIds()
    if (buffIds.length) {
      buffIds.slice(0, 2).forEach((id, i) => list.push({ name: `${p.name} · ${id}`, kind: i % 2 ? 'spd' : 'atk' }))
    }
  }
  if (!list.length) {
    list.push({ name: '全队攻击 +30%', kind: 'atk' }, { name: `${leadEnemy.value?.name ?? '敌方'} 减速 -20%`, kind: 'debuff' })
  }
  return list.slice(0, 6)
})

function isCurrentActor(id: string): boolean {
  return store.currentActorId === id
}

function selectCharacter(id: string): void {
  store.selectCharacter(id)
}

function getCharacterSide(characterId: string): 'left' | 'right' {
  return store.allyTeam.some((c) => c.id === characterId) ? 'left' : 'right'
}

function difficultyText(d: XiyouScene['difficulty']): string {
  return { easy: '简单', normal: '普通', hard: '困难', hell: '极难' }[d]
}

// ════════════ 战斗初始化（真实引擎） ════════════
/** 是否接受胜利结算掉落：仅当前战斗自然胜利时置 true，防切场景重置旧战斗误触发 */
let acceptingDrops = false

async function initBattle(): Promise<void> {
  acceptingDrops = false
  const { ally, enemy } = buildBattleTeams(props.scene)
  store.initializeBattleService(battleService)
  battleService.loadSkillConfigs()
  if (battleService.getIsBattleActive()) battleService.endBattle(ParticipantSide.ALLY)
  battleService.reset()
  battleService.clearParticipants()
  battleService.initializeTeams(ally, enemy)
  store.syncTeams()
  store.selectCharacter(ally[0]?.id ?? '')
  await store.startBattle()
  acceptingDrops = true
  if (!store.autoPlayMode) await store.toggleAutoPlay()
}

/** 战斗结束：胜利时结算场景掉落入背包（掉落闭环：引擎胜利 → 物品 → 背包） */
function onBattleEnded(data: BattleEndedEventData): void {
  if (data.winner !== ParticipantSide.ALLY || !acceptingDrops) return
  acceptingDrops = false
  usePackStore().applyDrops(dropsForScene(props.scene))
}

watch(() => props.scene.id, () => { void initBattle() })

onMounted(() => {
  battleService.on(BattleEventCodes.BATTLE_ENDED, onBattleEnded)
  void initBattle()
})

onUnmounted(() => {
  // NOTE: 必须按 callback 注销——off(event) 不带 callback 会清空该事件全部监听（含 battleStore 的）
  battleService.off(BattleEventCodes.BATTLE_ENDED, onBattleEnded)
  stopAllAnimations()
  participantCardRefs.value = {}
})
</script>

<style scoped lang="scss">
.xy-battle {
  grid-area: zen;
  margin: var(--space-3);
  padding: var(--space-4);
}

.xy-battle-head {
  flex-shrink: 0;
  text-align: center;
  border-bottom: 1px solid var(--xy-ink-line);
  padding-bottom: var(--space-3);
  margin-bottom: var(--space-4);
}

.xy-battle-scene {
  margin: 0 0 var(--space-1);
  font-family: var(--xy-font-title);
  font-size: var(--font-size-xxl);
  letter-spacing: 6px;
  color: var(--xy-ink-1);
}

.xy-battle-meta {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-battle-scale {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.xy-battle-scale-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px var(--space-3);
  border: 1px solid var(--xy-ink-line);
  border-radius: var(--radius-full);
  font-size: var(--font-size-md);
  letter-spacing: 1px;

  &--player {
    color: var(--xy-jade);
    border-color: rgba(var(--rgb-success), var(--alpha-border));
  }

  &--enemy {
    color: var(--xy-seal);
    border-color: rgba(var(--rgb-brand-red), var(--alpha-border));
  }
}

.xy-battle-scale-vs {
  font-family: var(--xy-font-title);
  font-size: var(--font-size-lg);
  color: var(--xy-ink-4);
}

.xy-enemy-bubbles {
  display: flex;
  justify-content: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.xy-enemy-bubble {
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--xy-ink-line);
  border-radius: 999px;
  background: var(--xy-paper-warm);
  cursor: pointer;
}

.xy-enemy-name {
  font-size: var(--font-size-md);
  color: var(--xy-ink-1);
}

.xy-enemy-level {
  font-size: var(--font-size-md);
  color: var(--xy-seal);
}

/* 技能灵台 + 行囊按钮同行 */
.xy-battle-zen-row {
  display: flex;
  align-items: stretch;
  gap: var(--space-3);

  :deep(.xy-altar) {
    flex: 1;
    min-width: 0;
  }
}

.xy-battle-pack {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  width: 64px;
  flex-shrink: 0;
  padding: var(--space-2);
  margin-bottom: var(--space-4);
  border: 1px solid var(--xy-ink-line);
  border-radius: var(--radius-sm);
  background: var(--xy-paper-warm);
  color: var(--xy-ink-2);
  cursor: pointer;
  font-family: inherit;

  &:hover {
    border-color: var(--xy-gold);
    color: var(--xy-gold);
  }
}

.xy-battle-pack-icon {
  width: 22px;
  height: 22px;
}

.xy-battle-pack-label {
  font-size: var(--font-size-md);
}

/* 4v4 双行阵容：敌方一行在上、我方一行在下（ParticipantCard 演武台同款） */
.xy-vitals {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.xy-vitals-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-2);
  align-items: stretch;
}

.xy-vs {
  align-self: center;
  font-family: var(--xy-font-title);
  font-size: var(--font-size-lg);
  letter-spacing: 4px;
  color: var(--xy-seal);
  line-height: 1;
}

.xy-battle-status {
  flex-shrink: 0;
  padding: var(--space-3) 0;
  margin-bottom: var(--space-3);
  border-top: 1px dashed var(--xy-ink-line);
  border-bottom: 1px dashed var(--xy-ink-line);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.xy-battle-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.xy-battle-round {
  font-family: var(--xy-font-title);
  font-size: var(--font-size-lg);
  letter-spacing: 3px;
  color: var(--xy-seal);
}

.xy-battle-order {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.xy-order-tag {
  flex-shrink: 0;
  font-size: var(--font-size-md);
  white-space: nowrap;

  &--player {
    color: var(--xy-jade);
  }

  &--enemy {
    color: var(--xy-seal);
  }
}

.xy-order-bar {
  flex: 1;
  height: 6px;
  background: var(--color-bg-secondary);
  border-radius: 3px;
  overflow: hidden;
}

.xy-order-bar-fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--xy-jade), var(--color-skill-active));
  border-radius: 3px;
}

.xy-battle-buffs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.xy-buff-tag {
  padding: 1px var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: var(--radius-full);
  font-size: var(--font-size-md);

  &--atk {
    color: var(--color-skill-active);
    border-color: rgba(var(--rgb-skill-active), var(--alpha-border));
  }

  &--spd {
    color: var(--xy-jade);
    border-color: rgba(var(--rgb-success), var(--alpha-border));
  }

  &--debuff {
    color: var(--color-debuff);
    border-color: rgba(var(--rgb-debuff), var(--alpha-border));
  }
}
</style>
