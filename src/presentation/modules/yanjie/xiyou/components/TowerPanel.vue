<template>
  <div class="xy-panel-scroll">
    <p class="xy-panel-hint">
      无尽塔 · 层层向上（挑战层）。材料产出：灵尘 / 器灵 / 突破丹叁（§22 法宝 / §18 宠物养成来源）。
      第 {{ TOWER_HIDDEN_FLOOR }} 层为隐藏层——通关第 {{ TOWER_MAX_FLOOR }} 层解锁。
    </p>

    <div class="xy-tower-head">
      <span class="xy-chip xy-chip--gold">最高通关 {{ towerState.bestFloor }} 层</span>
      <button type="button" class="xy-shop-buy" :disabled="!canChallenge(nextFloor)" @click="challenge(nextFloor)">
        {{ towerState.bestFloor >= TOWER_MAX_FLOOR && towerState.bestFloor < TOWER_HIDDEN_FLOOR ? '挑战隐藏层' : `挑战第 ${nextFloor} 层` }}
      </button>
    </div>

    <p v-if="lastResult" class="xy-row-desc" :class="lastResult.win ? 'xy-row-desc--key' : ''">
      {{ lastResult.text }}
    </p>

    <div class="xy-tower-list">
      <div v-for="f in floors" :key="f" class="xy-row-card" :class="{ 'xy-tower-done': f <= towerState.bestFloor }">
        <div class="xy-row-top">
          <span class="xy-row-name">{{ towerFloorPlan(f).label }}</span>
          <span v-if="f <= towerState.bestFloor" class="xy-chip xy-chip--jade">已通关</span>
          <span v-else-if="canChallenge(f)" class="xy-chip xy-chip--gold">可挑战</span>
          <span v-else class="xy-chip xy-chip--muted">未解锁</span>
        </div>
        <p class="xy-row-desc">{{ enemyNamesOf(f) || '编成生成中' }}</p>
        <p class="xy-row-desc xy-row-desc--key">{{ rewardTextOf(f) }}</p>
        <div v-if="canChallenge(f)" class="xy-fabao-ops">
          <button type="button" class="xy-shop-buy" :disabled="challenging" @click="challenge(f)">
            {{ challenging ? '战斗中…' : '挑战' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ParticipantSide } from '@/domain/battle/type/types'
import { runQuickBattle } from '@/application/service/QuickBattleSim'
import { usePackStore } from '@/presentation/stores/packStore'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import { equipBonuses, buildSimAlly, schoolTreeCombatBonuses } from '../battle'
import { fabaoAttributeBonuses } from '../fabao'
import { petMountAttributeBonuses } from '../petMount'
import {
  isTowerFloorUnlocked,
  nextTowerFloor,
  recordTowerClear,
  towerClearRewards,
  towerEnemiesForFloor,
  towerFloorPlan,
  towerState,
} from '../tower'

const pack = usePackStore()
const player = usePlayerStore()
const notification = useNotificationStore()

const floors = computed(() =>
  Array.from({ length: TOWER_HIDDEN_FLOOR }, (_, i) => i + 1).reverse(),
)
const nextFloor = computed(() => nextTowerFloor())

const canChallenge = (floor: number): boolean => isTowerFloorUnlocked(floor)

const challenging = ref(false)
interface TowerResult {
  win: boolean
  text: string
}
const lastResult = ref<TowerResult | null>(null)

function enemyNamesOf(floor: number): string {
  return towerEnemiesForFloor(floor).map((e) => e.name).join(' · ')
}

const REWARD_LABELS: Record<string, string> = {
  spirit_dust: '灵尘',
  spirit_core: '器灵',
  pet_break_pill_3: '突破丹·叁',
}

function rewardTextOf(floor: number): string {
  const parts = [`金钱 ${TOWER_FLOOR_GOLD * floor}`, `经验 ${TOWER_FLOOR_EXP * floor}`]
  for (const r of towerClearRewards(floor, false)) {
    parts.push(`${REWARD_LABELS[r.itemId] ?? r.itemId}×${r.count}`)
  }
  return `奖励：${parts.join(' · ')}`
}

/** 通关奖励入包（金钱/经验走玩家账，材料走背包） */
async function settleRewards(floor: number, firstClear: boolean): Promise<string[]> {
  player.gainCurrency('money', TOWER_FLOOR_GOLD * floor)
  player.gainExp(TOWER_FLOOR_EXP * floor)
  const msgs: string[] = []
  for (const r of towerClearRewards(floor, firstClear)) {
    pack.addItem(r.itemId, r.count)
    msgs.push(`${REWARD_LABELS[r.itemId] ?? r.itemId}×${r.count}`)
  }
  return msgs
}

async function challenge(floor: number): Promise<void> {
  if (challenging.value || !canChallenge(floor)) return
  const protagonist = player.battleSnapshot
  // 与 BattleZen / 扫荡同口径的主角加成（装备 + 流派树 + 法宝 + 宠物坐骑光环）
  const allyBonuses = {
    ...equipBonuses(pack.equippedStats(), protagonist),
    ...schoolTreeCombatBonuses(),
    ...fabaoAttributeBonuses(),
    ...petMountAttributeBonuses(),
  }
  const allyActors = buildSimAlly(allyBonuses, protagonist)
  const enemyEnemies = towerEnemiesForFloor(floor)
  if (enemyEnemies.length === 0) {
    notification.toast('塔层编成为空', 'warning')
    return
  }

  challenging.value = true
  try {
    const r = await runQuickBattle({ allyActors, enemyEnemies, seed: `tower_${floor}_${towerState.bestFloor}` })
    if (!r.ok) {
      notification.toast(r.reason ?? '战斗执行失败', 'error')
      return
    }
    if (r.winner !== ParticipantSide.ALLY) {
      lastResult.value = { win: false, text: `第 ${floor} 层挑战失败（${r.rounds} 回合）——提升实力后再来` }
      notification.toast('挑战失败', 'warning')
      return
    }
    const firstClear = await recordTowerClear(floor)
    const rewards = await settleRewards(floor, firstClear)
    lastResult.value = {
      win: true,
      text: `第 ${floor} 层通关（${r.rounds} 回合）${firstClear ? '· 首通' : ''}${
        rewards.length ? ` · 获得 ${rewards.join('、')}` : ''
      }`,
    }
    notification.toast(`第 ${floor} 层通关！`, 'success')
  } finally {
    challenging.value = false
  }
}

onMounted(() => {
  void pack.init()
})
</script>

<style scoped lang="scss">
.xy-tower-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.xy-tower-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.xy-tower-done {
  opacity: 0.75;
}
</style>
