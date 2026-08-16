<template>
  <main class="xy-battle xy-panel" aria-label="战斗禅台">
    <!-- 顶部：左叙事 右掉落表（方案B · 战前一眼读完，阵容由战场区实时展示不重复） -->
    <header class="xy-battle-head">
      <div class="xy-battle-head-grid">
        <div class="xy-battle-head-left">
          <h2 class="xy-battle-scene">
            {{ scene.name }}
            <span class="xy-battle-meta">Lv.{{ scene.levelRange?.[0] }}-{{ scene.levelRange?.[1] }}</span>
          </h2>

          <p class="xy-battle-desc">{{ scene.desc }}</p>
          <p v-if="scene.narrativeHook" class="xy-battle-hook">{{ scene.narrativeHook }}</p>
        </div>
        <div class="xy-battle-head-right" role="list" aria-label="敌人与掉落">
          <div v-for="e in scene.enemies" :key="e.name" class="xy-drop-row" role="listitem">
            <span class="xy-drop-ename">
              <span class="xy-dot" :class="dotClass(e.type)"></span>
              <span class="xy-drop-name">{{ e.name }}</span>
              <span class="xy-drop-lv">Lv.{{ e.level }}</span>
            </span>
            <span class="xy-drop-items">
              <span v-for="d in dropsForEnemy(e.name)" :key="d.itemId" class="xy-drop-chip">
                <span class="xy-drop-chip-name">{{ itemName(d.itemId) }}<template v-if="d.quantity > 1">×{{ d.quantity
                    }}</template></span>
                <span class="xy-pct" :class="pctClass(d.chance)">{{ Math.round(d.chance * 100) }}%</span>
              </span>
            </span>
          </div>
          <div v-if="scene.guardian" class="xy-drop-row xy-drop-row--guardian" role="listitem">
            <span class="xy-drop-ename">
              <span class="xy-dot xy-dot--guardian"></span>
              <span class="xy-drop-name">{{ scene.guardian.name }}</span>
              <span class="xy-guard-tag">守护</span>
            </span>
            <span class="xy-drop-items">
              <span v-for="d in dropsForEnemy(scene.guardian.name)" :key="d.itemId" class="xy-drop-chip">
                <span class="xy-drop-chip-name">{{ itemName(d.itemId) }}<template v-if="d.quantity > 1">×{{ d.quantity
                    }}</template></span>
                <span class="xy-pct" :class="pctClass(d.chance)">{{ Math.round(d.chance * 100) }}%</span>
              </span>
            </span>
          </div>
          <div v-if="scene.drops?.materials?.length" class="xy-drop-row xy-drop-row--materials" role="listitem">
            <span class="xy-drop-ename">
              <span class="xy-dot xy-dot--materials"></span>
              <span class="xy-drop-name">关卡必掉</span>
            </span>
            <span class="xy-drop-items">
              <span v-for="m in scene.drops.materials" :key="m" class="xy-drop-chip">
                <span class="xy-drop-chip-name">{{ itemName(m) }}</span>
                <span class="xy-pct xy-pct--main">必掉</span>
              </span>
            </span>
          </div>
        </div>
      </div>
    </header>

    <!-- 中上部：4v4 角色卡片（敌方一行 / 我方一行，演武台同款 ParticipantCard） -->
    <div class="xy-vitals">
      <div class="xy-vitals-row xy-vitals-row--enemy" role="list" aria-label="敌方阵容">
        <ParticipantCard v-for="c in store.enemyTeam" :key="c.id" :ref="(el) => handleCardRef(c.id, el)"
          :participant="c" :is-active="isCurrentActor(c.id)" :is-selected="store.selectedCharacterId === c.id"
          :is-enemy="true" :turn-tick="store.currentTurn" @click="selectCharacter(c.id)" />
      </div>

      <div class="xy-vs">
        <span class="xy-vs-mark" aria-hidden="true">斗</span>
        <button type="button" class="xy-vs-speed" :title="`战斗速度 ${store.battleSpeed}x，点击切换`"
          @click="cycleSpeed">{{ store.battleSpeed }}x</button>
      </div>

      <div class="xy-vitals-row xy-vitals-row--player" role="list" aria-label="我方阵容">
        <ParticipantCard v-for="c in store.allyTeam" :key="c.id" :ref="(el) => handleCardRef(c.id, el)" :participant="c"
          :is-active="isCurrentActor(c.id)" :is-selected="store.selectedCharacterId === c.id" :is-enemy="false"
          :turn-tick="store.currentTurn" @click="selectCharacter(c.id)" />
      </div>
    </div>

    <!-- 战斗快捷栏浮层 -->
    <QuickSlotBar v-model:open="quickOpen" />

    <!-- 底部：日志中心（tab4 全局唯一日志模块，直接复用 tab1 唤灵台 BattleLog——战斗/系统/调试三页签） -->
    <BattleLog />

    <!-- 战斗视觉特效层（演武台同款） -->
    <BattleVisualEffects ref="visualEffectsRef" />
  </main>
</template>

<script setup lang="ts">
import { ActionTypes, ActionResultType, ParticipantSide } from '@/domain/battle/type/types'
import { BattleEventCodes, type BattleEndedEventData } from '@/domain/battle/type/BattleEventType'
import type { BattleService } from '@/application/facade/BattleFacade'
import { container } from '@/infrastructure/di/Container'
import BattleVisualEffects from '@/presentation/components/BattleVisualEffects.vue'
import ParticipantCard from '@/presentation/components/ParticipantCard.vue'
import { useBattleAnimation } from '@/presentation/composables/useBattleAnimation'
import { useBattleStore } from '@/presentation/stores/battleStore'
import { usePackStore } from '@/presentation/stores/packStore'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { BATTLE_ANIMATION_TIMING, getActionBudget } from '@/shared/constants/animation-timing'
import { getVisualEffect } from '@/shared/utils/visual-effect-mapper'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { itemName } from '../caveLogic'
import { PLAYER_ID } from '@/shared/constants/player'
import {
  buildBattleTeams,
  dropsForEnemy,
  dropsForScene,
  equipBonuses,
  rewardForScene,
} from '../battle'
import type { XiyouScene } from '../types'
import { markSceneCleared } from '../xiyouData'
import { saveManager } from '../save-bridge'
import BattleLog from '@/presentation/modules/huanling/views/BattleLog.vue'
import QuickSlotBar from './QuickSlotBar.vue'

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

/** 战斗倍速档位（对齐调试台 speed 选项） */
const BATTLE_SPEEDS = [1, 2, 4, 5] as const

function cycleSpeed(): void {
  const idx = BATTLE_SPEEDS.indexOf(store.battleSpeed as 1 | 2 | 4 | 5)
  const next = BATTLE_SPEEDS[(idx < 0 ? 0 : idx + 1) % BATTLE_SPEEDS.length]
  store.setBattleSpeed(next)
}

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
function isCurrentActor(id: string): boolean {
  return store.currentActorId === id
}

function selectCharacter(id: string): void {
  store.selectCharacter(id)
}

function getCharacterSide(characterId: string): 'left' | 'right' {
  return store.allyTeam.some((c) => c.id === characterId) ? 'left' : 'right'
}

// ════════════ 头部 · 方案B 派生（左叙事 右掉落表） ════════════

/** 敌人血统点：new_born 新生 / old_blood 旧血 / old_soul 旧魂（对齐 scenes.json type 与方案B 色点） */
function dotClass(type?: string): string {
  if (type === 'old_blood') return 'xy-dot--old-blood'
  if (type === 'old_soul') return 'xy-dot--old-soul'
  return 'xy-dot--new-born'
}

/** 掉落概率色阶：主掉落青 / 次掉落灰 / 稀有金 */
function pctClass(chance: number): string {
  if (chance >= 0.35) return 'xy-pct--main'
  if (chance < 0.1) return 'xy-pct--rare'
  return 'xy-pct--minor'
}

// ════════════ 战斗初始化（真实引擎） ════════════
/** 是否接受胜利结算掉落：仅当前战斗自然胜利时置 true，防切场景重置旧战斗误触发 */
let acceptingDrops = false

async function initBattle(): Promise<void> {
  acceptingDrops = false
  // NOTE: 已穿戴装备属性注入主角（背包实例化闭环：制造 → 装备 → 战斗生效）
  // 先确保 packStore 已 init（玩家可能未开行囊/洞府直接战斗：背包/装备/掉落都要就绪）
  const pack = usePackStore()
  await pack.init()
  const protagonist = usePlayerStore().battleSnapshot
  const allyBonuses = equipBonuses(pack.equippedStats(), protagonist)
  const { ally, enemy } = buildBattleTeams(props.scene, allyBonuses, protagonist)
  store.initializeBattleService(battleService)
  battleService.loadSkillConfigs()
  // NOTE: 切场景收尾旧战斗用 reset（静默清场）而非 endBattle——endBattle 会广播 BATTLE_ENDED，
  //       被全局 battleStore 当成一场战斗结算并弹出战报（唤灵台 BattleField 常驻监听）。未打完的
  //       旧战斗不应触发战报，reset + clearParticipants 已覆盖停自动战斗/清 buff/清录制。
  battleService.reset()
  battleService.clearParticipants()
  battleService.initializeTeams(ally, enemy)
  store.syncTeams()
  store.selectCharacter(ally[0]?.id ?? '')
  await store.startBattle()
  acceptingDrops = true
  // NOTE: 进入斗战西游只建战斗不强制自动打，玩家点技能/自动按钮后才行动
}

/** 战斗结束：回写主角当前血/能量 → 结算经验/金钱/掉落入账（W16 经济闭环）→ 上报结算结果 */
function onBattleEnded(data: BattleEndedEventData): void {
  const victory = data.winner === ParticipantSide.ALLY
  const player = usePlayerStore()
  const pack = usePackStore()

  // 战斗内主角状态回写面板（战斗为引擎独立副本，结束须同步；升级后 createPlayerProfile 会回满）
  const allyPlayer = store.allyTeam.find((p) => p.id === PLAYER_ID)
  if (allyPlayer) {
    player.player.hp = Math.max(0, Math.min(allyPlayer.currentHealth, player.player.maxHp))
    player.player.energy = Math.max(0, Math.min(allyPlayer.currentEnergy, player.player.maxEnergy))
  }

  if (victory && acceptingDrops) {
    acceptingDrops = false
    // 通关解锁链：胜利解锁本关与依赖它的后续关卡（V08）
    markSceneCleared(props.scene.id)
    // 奖励：场景敌人 gold/exp 区间随机加总（configs/enemies/enemies.json 权威）
    const reward = rewardForScene(props.scene)
    const roll = (range: [number, number] | undefined): number =>
      range ? Math.round(range[0] + Math.random() * (range[1] - range[0])) : 0
    const exp = roll(reward.exp)
    const gold = roll(reward.gold)
    if (exp > 0) player.gainExp(exp)
    if (gold > 0) player.gainCurrency('copper', gold)
    // 掉落：入包（applyDrops 内部逐条 roll + toast）
    pack.applyDrops(dropsForScene(props.scene))
  }

  // NOTE: 胜负结算完成后自动存档（PRD §5.3 关键节点触发；含失败局，保证最近进度可恢复）
  void saveManager.autoSave()
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

/* ═══ 方案B · 左叙事 右掉落表（战前全展开零交互，阵容由战场区展示不重复） ═══ */
.xy-battle-head {
  flex-shrink: 0;
  border-bottom: 1px solid var(--xy-ink-line);
  padding-bottom: var(--space-3);
  margin-bottom: var(--space-4);
}

.xy-battle-head-grid {
  display: flex;
  gap: var(--space-3);
  align-items: center;
}

.xy-battle-head-left,
.xy-battle-head-right {
  flex: 1 1 50%;
  min-width: 0;
}

.xy-battle-head-left {
  border-right: 1px solid var(--xy-ink-line);
  padding-right: var(--space-3);
}

.xy-battle-scene {
  margin: 0;

  font-size: var(--font-size-xl);
  letter-spacing: 3px;
  color: var(--xy-ink-1);
}

.xy-battle-meta {
  margin: var(--space-1) 0 0;
  color: var(--xy-ink-3);
}

.xy-battle-desc {
  margin: var(--space-2) 0 0;
  line-height: var(--line-height-md);
  color: var(--xy-ink-2);
}

.xy-battle-hook {
  margin: var(--space-1) 0 0;
  padding-left: var(--space-2);
  border-left: 2px solid var(--xy-gold);
  color: var(--xy-ink-3);
}

.xy-battle-head-right {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-2);
  min-width: 0;
}

.xy-drop-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.xy-drop-ename {
  width: 160px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-width: 0;
}

.xy-drop-name {
  color: var(--xy-ink-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.xy-drop-lv {
  color: var(--xy-seal);
  white-space: nowrap;
}

.xy-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;

  &--new-born {
    background: var(--xy-jade);
  }

  &--old-blood {
    background: var(--xy-seal);
  }

  &--old-soul {
    background: var(--color-skill-active);
  }

  &--guardian {
    background: var(--xy-gold);
  }

  &--materials {
    background: var(--xy-jade);
  }
}

.xy-drop-items {
  display: flex;
  gap: var(--space-1);
  flex-wrap: wrap;
  min-width: 0;
}

.xy-drop-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 1px var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: var(--radius-full);
  background: var(--xy-paper-warm);
  color: var(--xy-ink-2);
  white-space: nowrap;
}

.xy-drop-chip-name {
  color: var(--xy-ink-2);
}

.xy-pct {
  &--main {
    color: var(--xy-jade);
  }

  &--minor {
    color: var(--xy-ink-4);
  }

  &--rare {
    color: var(--xy-gold);
  }
}

.xy-drop-row--guardian .xy-drop-name {
  color: var(--xy-gold);
}

.xy-drop-items--hint {
  color: var(--xy-ink-4);
}

.xy-guard-tag {
  color: var(--xy-gold);
  border: 1px solid rgba(var(--rgb-warning), 0.45);
  background: var(--xy-gold-soft);
  padding: 0 5px;
  border-radius: 3px;
  flex-shrink: 0;
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
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  align-self: center;

  .xy-vs-mark {
    font-size: var(--font-size-lg);
    letter-spacing: 4px;
    color: var(--xy-seal);
    line-height: 1;
  }

  .xy-vs-speed {
    padding: 2px 10px;
    border: 1px solid var(--xy-ink-line);
    border-radius: var(--radius-sm);
    background: var(--xy-paper-warm);
    color: var(--xy-ink-2);
    font-family: var(--font-family-mono);
    font-variant-numeric: tabular-nums;
    cursor: pointer;

    &:hover {
      border-color: var(--xy-gold);
      color: var(--xy-gold);
    }
  }
}
</style>
