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
            <span class="xy-drop-items xy-drop-items--hint">定向稀有 · 值得重复挑战</span>
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

      <span class="xy-vs" aria-hidden="true">斗</span>

      <div class="xy-vitals-row xy-vitals-row--player" role="list" aria-label="我方阵容">
        <ParticipantCard v-for="c in store.allyTeam" :key="c.id" :ref="(el) => handleCardRef(c.id, el)" :participant="c"
          :is-active="isCurrentActor(c.id)" :is-selected="store.selectedCharacterId === c.id" :is-enemy="false"
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
        <span class="xy-order-tag xy-order-tag--player">我方先锋 {{ leadPlayer?.name ?? '—' }} · 速 {{
          leadPlayer?.getAttribute(ATTRIBUTE_CODE.speed) ?? 0 }}</span>
        <span class="xy-order-bar"><span class="xy-order-bar-fill" :style="orderFillStyle"></span></span>
        <span class="xy-order-tag xy-order-tag--enemy">敌方先锋 {{ leadEnemy?.name ?? '—' }} · 速 {{
          leadEnemy?.getAttribute(ATTRIBUTE_CODE.speed) ?? 0 }}</span>
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
          <path d="M5 8h14v11H5zM5 8c0-2.2 1.8-4 4-4h6c2.2 0 4 1.8 4 4M9 12h6" fill="none" stroke="currentColor"
            stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="xy-battle-pack-label">行囊</span>
      </button>
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
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { BATTLE_ANIMATION_TIMING, getActionBudget } from '@/shared/constants/animation-timing'
import { getVisualEffect } from '@/shared/utils/visual-effect-mapper'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { itemName } from '../data/caveLogic'
import {
  buildBattleTeams,
  dropsForEnemy,
  dropsForScene,
  equipBonuses,
  markSceneCleared,
  rewardForScene,
  type XiyouScene,
} from '../data/mock'
import { saveManager } from '../data/save-bridge'
import BattleLog from '@/presentation/modules/huanling/views/BattleLog.vue'
import QuickSlotBar from './QuickSlotBar.vue'
import SkillAltar from './SkillAltar.vue'

const props = defineProps<{ scene: XiyouScene }>()

/** 战斗结算结果（供父级弹窗展示：胜负 / 经验 / 金钱 / 掉落 / 升级） */
export interface BattleResultData {
  winner: 'player' | 'enemy'
  exp: number
  gold: number
  leveled: number
  drops: Array<{ itemId: string; quantity: number; name: string }>
  victory: boolean
}

const emit = defineEmits<{ result: [BattleResultData] }>()

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
  if (battleService.getIsBattleActive()) battleService.endBattle(ParticipantSide.ALLY)
  battleService.reset()
  battleService.clearParticipants()
  battleService.initializeTeams(ally, enemy)
  store.syncTeams()
  store.selectCharacter(ally[0]?.id ?? '')
  await store.startBattle()
  acceptingDrops = true
  // NOTE: 进入斗战西游只建战斗不强制自动打，玩家点技能/自动按钮后才行动
}

/** 战斗结束：胜利时结算经验/金钱/掉落入账（W16 经济闭环），并上报结算结果供展示 */
function onBattleEnded(data: BattleEndedEventData): void {
  const victory = data.winner === ParticipantSide.ALLY
  const player = usePlayerStore()
  const pack = usePackStore()

  let exp = 0
  let gold = 0
  let leveled = 0
  const drops: BattleResultData['drops'] = []

  if (victory && acceptingDrops) {
    acceptingDrops = false
    // 通关解锁链：胜利解锁本关与依赖它的后续关卡（V08）
    markSceneCleared(props.scene.id)
    // 奖励：场景敌人 gold/exp 区间随机加总（configs/enemies/enemies.json 权威）
    const reward = rewardForScene(props.scene)
    const roll = (range: [number, number] | undefined): number =>
      range ? Math.round(range[0] + Math.random() * (range[1] - range[0])) : 0
    exp = roll(reward.exp)
    gold = roll(reward.gold)
    const levelBefore = player.player.level
    if (exp > 0) player.gainExp(exp)
    if (gold > 0) player.gainCurrency('copper', gold)
    leveled = player.player.level - levelBefore
    // 掉落：入包并汇总展示（applyDrops 内部逐条 roll + toast，返回命中项）
    const sceneDrops = dropsForScene(props.scene)
    const hit = pack.applyDrops(sceneDrops)
    for (const d of hit) {
      drops.push({ itemId: d.itemId, quantity: d.quantity, name: itemName(d.itemId) })
    }
  }

  // NOTE: 胜负结算完成后自动存档（PRD §5.3 关键节点触发；含失败局，保证最近进度可恢复）
  void saveManager.autoSave()
  emit('result', {
    winner: victory ? 'player' : 'enemy',
    victory,
    exp,
    gold,
    leveled,
    drops,
  })
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

.xy-battle-pack-label {}

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
