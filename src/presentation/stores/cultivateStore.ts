/**
 * cultivateStore.ts — 流派修行·技能树运行时操作（Pinia）
 *
 * 设计要点：
 * - 状态引用 xiyouData 模块级 reactive（schools/skillPoints/equippedSkills/pureSchoolBonus），
 *   与存档桥接（save-bridge）、战斗桥接（battle.ts）同源，避免双轨。
 * - 解锁/装备/洗点等操作后触发防抖自动存档（需求 §4.2：500ms），保证技能树状态可持久化。
 * - 纯流派加成判定（需求 §2.5）：已装备技能全部来自同一流派 → 注入该流派 pureBonus，
 *   判定在每次装备槽变更时重算。
 */

import { computed } from 'vue'
import { defineStore } from 'pinia'
import {
  equippedSkills,
  grantLevelPoint,
  grantPillPoint,
  pureSchoolBonus,
  schools,
  skillNodeMap,
  skillPoints,
  availableSkillPoints,
  calcPureSchool,
  LEVEL_POINT_LIMIT,
  PILL_POINT_LIMIT,
} from '@/presentation/modules/yanjie/xiyou/xiyouData'
import type { XiyouSkillNode } from '@/presentation/modules/yanjie/xiyou/types'
import { usePlayerStore } from './playerStore'
import { saveManager } from '@/presentation/modules/yanjie/xiyou/save-bridge'

export type EquipSlotType = 'passive' | 'small' | 'ultimate'

/** 出战槽位上限（schools.json equipSlots：被动 2 / 小技能 2 / 大招 1） */
const SLOT_LIMIT: Record<EquipSlotType, number> = { passive: 2, small: 2, ultimate: 1 }
/** 大招解锁上限（设计稿 §6.3：跨流派合计最多 2 个） */
const ULT_LEARN_LIMIT = 2
/** 洗点单价：金钱 = 单价 × 已分配点数 */
export const RESET_PRICE_PER_POINT = 500

/** 节点类型 → 装备槽类型（attribute/enhance 无对应槽位，返回 null） */
function slotTypeOf(node: XiyouSkillNode): EquipSlotType | null {
  if (node.type === 'passive') return 'passive'
  if (node.type === 'skill') return 'small'
  if (node.type === 'ultimate') return 'ultimate'
  return null
}

export const useCultivateStore = defineStore('cultivate', () => {
  const player = usePlayerStore()

  // ════════════ 派生状态 ════════════

  /** 当前可用技能点（earned - spent） */
  const availablePoints = computed(() => availableSkillPoints())
  /** 已分配技能点 */
  const spentPoints = computed(() => skillPoints.spent)
  /** 已服用悟道丹次数 */
  const pillsUsed = computed(() => skillPoints.totalPillsUsed)
  /** 已解锁节点数 */
  const unlockedCount = computed(() => schools.reduce((sum, s) => sum + s.nodes.filter((n) => n.learned).length, 0))

  /** 节点是否已解锁 */
  const isNodeUnlocked = (nodeId: string): boolean => !!skillNodeMap.get(nodeId)?.learned

  /** 节点前置判定：同分支上一层已点亮（第 1 层无前置，允许跨流派直接点亮） */
  function prereqMet(node: XiyouSkillNode): boolean {
    if (node.tier === 1) return true
    const prev = schools
      .find((s) => s.id === node.schoolId)
      ?.nodes.find((p) => p.branch === node.branch && p.tier === node.tier - 1)
    return prev ? prev.learned === true : false
  }

  /** 已解锁大招数量（跨流派合计，设计稿 §6.3 上限 2） */
  function ultLearnedCount(): number {
    let n = 0
    for (const s of schools) for (const nd of s.nodes) if (nd.learned && nd.type === 'ultimate') n++
    return n
  }

  /** 节点可解锁判定：存在/未解锁/点数够/前置满足/大招上限 */
  const canUnlock = (nodeId: string): boolean => {
    const node = skillNodeMap.get(nodeId)
    if (!node || node.learned) return false
    if (availablePoints.value < node.points) return false
    if (!prereqMet(node)) return false
    if (node.type === 'ultimate' && ultLearnedCount() >= ULT_LEARN_LIMIT) return false
    return true
  }

  /** 战斗可用技能（节点 id → 技能配置 id）：供 battle.ts 注入 BattleEntity */
  const combatSkills = computed<{ passive: string[]; small: string[]; ultimate: string | null }>(() => {
    const configId = (nodeId: string): string | undefined => skillNodeMap.get(nodeId)?.skillId
    return {
      passive: equippedSkills.passive.map(configId).filter((v): v is string => !!v),
      small: equippedSkills.small.map(configId).filter((v): v is string => !!v),
      ultimate: equippedSkills.ultimate ? (configId(equippedSkills.ultimate) ?? null) : null,
    }
  })

  // ════════════ 状态变更操作（均触发防抖自动存档） ════════════

  /** 解锁节点：校验前置/点数/大招上限 → 点亮并消耗技能点 */
  function unlockNode(nodeId: string): boolean {
    if (!canUnlock(nodeId)) return false
    const node = skillNodeMap.get(nodeId)!
    node.learned = true
    skillPoints.spent += node.points
    scheduleAutoSave()
    return true
  }

  /** 洗点：消耗 500×已分配点数 金钱，清空全部解锁节点与装备槽，返还技能点 */
  function resetNodes(): boolean {
    const cost = RESET_PRICE_PER_POINT * skillPoints.spent
    if (cost <= 0 || player.currency.copper < cost) return false
    player.currency.copper -= cost
    for (const s of schools) for (const nd of s.nodes) nd.learned = false
    skillPoints.spent = 0
    clearEquipped()
    recalcPureBonus()
    scheduleAutoSave()
    return true
  }

  /** 洗点消耗（供 UI 禁用态判断） */
  function resetCost(): number {
    return RESET_PRICE_PER_POINT * skillPoints.spent
  }

  /** 装备已解锁技能到槽位（槽满时替换最早装备的；同一节点只占一个槽） */
  function equipSkill(nodeId: string, slot: EquipSlotType): boolean {
    const node = skillNodeMap.get(nodeId)
    if (!node || !node.learned) return false
    if (slotTypeOf(node) !== slot) return false
    if (nodeIdAlreadyEquipped(nodeId)) return true
    removeFromEquipped(nodeId)
    if (slot === 'ultimate') {
      equippedSkills.ultimate = nodeId
    } else {
      const list = equippedSkills[slot] as string[]
      if (list.length >= SLOT_LIMIT[slot]) list.shift()
      list.push(nodeId)
    }
    recalcPureBonus()
    scheduleAutoSave()
    return true
  }

  /** 从槽位移除技能 */
  function unequipSkill(nodeId: string): boolean {
    const removed = removeFromEquipped(nodeId)
    if (removed) {
      recalcPureBonus()
      scheduleAutoSave()
    }
    return removed
  }

  /** 节点是否已装备（任意槽） */
  const isEquipped = (nodeId: string): boolean => {
    return (
      equippedSkills.passive.includes(nodeId) ||
      equippedSkills.small.includes(nodeId) ||
      equippedSkills.ultimate === nodeId
    )
  }

  /** 已解锁技能节点（装备池来源） */
  const unlockedSkillNodes = computed<XiyouSkillNode[]>(() =>
    schools.flatMap((s) => s.nodes).filter((n) => n.learned && slotTypeOf(n)),
  )

  /** 纯流派加成判定（装备槽变更后重算） */
  function recalcPureBonus(): void {
    pureSchoolBonus.value = calcPureSchool(equippedSkills)
  }

  // ════════════ 内部工具 ════════════

  function nodeIdAlreadyEquipped(nodeId: string): boolean {
    return (
      equippedSkills.passive.includes(nodeId) ||
      equippedSkills.small.includes(nodeId) ||
      equippedSkills.ultimate === nodeId
    )
  }

  function removeFromEquipped(nodeId: string): boolean {
    const p = equippedSkills.passive.indexOf(nodeId)
    if (p >= 0) {
      equippedSkills.passive.splice(p, 1)
      return true
    }
    const s = equippedSkills.small.indexOf(nodeId)
    if (s >= 0) {
      equippedSkills.small.splice(s, 1)
      return true
    }
    if (equippedSkills.ultimate === nodeId) {
      equippedSkills.ultimate = null
      return true
    }
    return false
  }

  function clearEquipped(): void {
    equippedSkills.passive = []
    equippedSkills.small = []
    equippedSkills.ultimate = null
  }

  // ════════════ 自动存档（防抖 500ms，需求 §4.2） ════════════
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  function scheduleAutoSave(): void {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void saveManager.autoSave()
    }, 500)
  }

  return {
    // 状态
    skillPoints,
    equippedSkills,
    pureSchoolBonus,
    availablePoints,
    spentPoints,
    pillsUsed,
    unlockedCount,
    combatSkills,
    unlockedSkillNodes,
    // 派生
    isNodeUnlocked,
    canUnlock,
    isEquipped,
    // 操作
    unlockNode,
    resetNodes,
    resetCost,
    equipSkill,
    unequipSkill,
    recalcPureBonus,
    grantLevelPoint,
    grantPillPoint,
    levelPointLimit: LEVEL_POINT_LIMIT,
    pillPointLimit: PILL_POINT_LIMIT,
  }
})
