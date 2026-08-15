/**
 * save-bridge.ts — 演劫台存档端口实现
 *
 * 将运行时状态（playerStore / packStore / scenes）映射为 SaveData v2.0.0 并反向恢复。
 * 与 SaveManager（shared/utils/save-manager.ts）解耦：此处持有 store 依赖，manager 保持纯编排。
 *
 * 映射要点：
 * - 货币三币种 → player.gold/silver/jade（PRD 仅 gold，扩展防止丢失）
 * - 装备 6 槽（weapon/armor/helmet/boots/charm/ring）一一对应
 * - 物品按 type 分类到 inventory 四类（装备 → equipments，材料/丹药 → materials/elixirs，其余 → misc）
 */

import { createInitialGameState, type SaveData, type SaveEquipmentInstance } from '@/shared/utils/save-schema'
import type { SaveStatePort } from '@/shared/utils/save-manager'
import { SaveManager } from '@/shared/utils/save-manager'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import {
  GEAR_SLOT_LABELS,
  makeInstance,
  usePackStore,
  type GearAffix,
  type GearInstance,
  type GearSlotKey,
} from '@/presentation/stores/packStore'
import { materials as packMaterials, packItems, pills as packPills, scenes, schools, skillPoints, equippedSkills, skillNodeMap, pureSchoolBonus, calcPureSchool, PILL_POINT_LIMIT } from './xiyouData'
import type { XiyouDifficulty } from './types'
import { qualityFactorOf } from './quality'
import { createPlayerProfile } from './playerProfile'

const INITIAL_STAT_POINTS = { available: 3, strength: 0, vitality: 0, agility: 0, spirit: 0 }

/** pack.json 组（name → id 索引）：材料组 / 丹药组，用于物品四类归属 */
const PACK_NAME_TO_ID = new Map<string, string>()
for (const it of packItems) if (!PACK_NAME_TO_ID.has(it.name)) PACK_NAME_TO_ID.set(it.name, it.id)

/** 4 类物品分类：材料（pack.json materials）/ 丹药（pack.json pills）/ 其他；装备走 gearInstances → equipments */
function classifyInventory(): SaveData['inventory'] {
  const out = createInitialGameState().inventory
  const pack = usePackStore()
  const materialIds = new Set(packMaterials.map((it) => PACK_NAME_TO_ID.get(it.name)).filter((v): v is string => !!v))
  const pillIds = new Set(packPills.map((it) => PACK_NAME_TO_ID.get(it.name)).filter((v): v is string => !!v))
  for (const [id, count] of Object.entries(pack.inventory)) {
    if (pillIds.has(id)) out.elixirs[id] = count
    else if (materialIds.has(id)) out.materials[id] = count
    else out.misc[id] = count
  }
  // 装备实例按 itemId 聚合到 equipments（词缀/强化详见 equipment_instances）
  for (const g of pack.gearInstances) out.equipments[g.itemId] = (out.equipments[g.itemId] ?? 0) + 1
  return out
}

/** 装备实例 → 存档结构（六槽一一对应） */
function serializeInstances(): SaveEquipmentInstance[] {
  const pack = usePackStore()
  const out: SaveEquipmentInstance[] = []
  for (const g of pack.gearInstances) {
    out.push({ instanceId: g.instanceId, itemId: g.itemId, enhance: g.enhance, quality: g.quality, qualityFactor: g.qualityFactor, star: g.star ?? 0, affixes: g.affixes.map((a) => ({ ...a })) })
  }
  for (const slot of Object.keys(GEAR_SLOT_LABELS) as GearSlotKey[]) {
    const inst = pack.equipped[slot]
    if (inst) {
      out.push({ instanceId: inst.instanceId, itemId: inst.itemId, enhance: inst.enhance, quality: inst.quality, qualityFactor: inst.qualityFactor, star: inst.star ?? 0, affixes: inst.affixes.map((a) => ({ ...a })) })
    }
  }
  return out
}

/** 装备槽类型（存档 equipped 键） */
type EquipSlotKey = 'passive' | 'small' | 'ultimate'

/** 恢复出战装备槽：过滤未解锁或类型不匹配槽位的节点引用（存档容错） */
function restoreEquipped(eq: { passive?: string[]; small?: string[]; ultimate?: string | null } | undefined): void {
  const valid = (id: string, slot: EquipSlotKey): boolean => {
    const node = skillNodeMap.get(id)
    if (!node || !node.learned) return false
    if (slot === 'passive') return node.type === 'passive'
    if (slot === 'small') return node.type === 'skill'
    return node.type === 'ultimate'
  }
  equippedSkills.passive = (eq?.passive ?? []).filter((id) => valid(id, 'passive'))
  equippedSkills.small = (eq?.small ?? []).filter((id) => valid(id, 'small'))
  const ult = eq?.ultimate
  equippedSkills.ultimate = ult && valid(ult, 'ultimate') ? ult : null
}

export const xiyouSaveBridge: SaveStatePort = {
  async collect({ currentSceneId }): Promise<SaveData> {
    const data = createInitialGameState()
    const player = usePlayerStore()
    const pack = usePackStore()
    // 确保行囊已 init（未 init 时空背包写入会覆盖 configs 初始持有）
    await pack.init()

    // player
    data.player.level = player.player.level
    data.player.exp = player.player.exp
    data.player.hp_max = player.player.maxHp
    data.player.energy_max = player.player.maxEnergy
    data.player.base_atk = [player.player.attackMin, player.player.attackMax]
    data.player.gold = player.currency.copper
    data.player.silver = player.currency.silver
    data.player.jade = player.currency.jade
    data.player.statBonuses = {
      available: player.statPoints.available,
      strength: player.statPoints.strength,
      vitality: player.statPoints.vitality,
      agility: player.statPoints.agility,
      spirit: player.statPoints.spirit,
    }

    // progress
    const unlocked = scenes.filter((s) => s.unlocked)
    data.progress.unlocked_scenes = unlocked.map((s) => s.id)
    data.progress.max_scene = unlocked.length
    const current = currentSceneId ? scenes.find((s) => s.id === currentSceneId) : undefined
    data.progress.current_scene = current?.id ?? unlocked[0]?.id ?? ''
    data.progress.current_difficulty = (current?.difficulty ?? 'easy') as XiyouDifficulty

    // inventory
    data.inventory = classifyInventory()

    // equipment（六槽一一对应；存实例 id 引用）
    for (const slot of Object.keys(GEAR_SLOT_LABELS) as GearSlotKey[]) {
      data.equipment[slot] = pack.equipped[slot]?.instanceId ?? null
    }

    // equipment_instances（词缀 + 强化等级）
    data.equipment_instances = serializeInstances()

    // school（v3.0 流派：已点亮节点 id + 已用技能点 + 出战装备槽）
    // NOTE: selected 字段保留兼容（旧档读取），新档不再写入选流派（v3.0 跨流派加点无单一流派概念）
    data.school = {
      selected: null,
      learned: schools.flatMap((s) => s.nodes.filter((n) => n.learned).map((n) => n.id)),
      spent: skillPoints.spent,
      earned: skillPoints.earned,
      totalPillsUsed: skillPoints.totalPillsUsed,
      equipped: {
        passive: [...equippedSkills.passive],
        small: [...equippedSkills.small],
        ultimate: equippedSkills.ultimate,
      },
    }

    return data
  },

  async restore(data): Promise<void> {
    const player = usePlayerStore()
    const pack = usePackStore()
    // 确保行囊已 init（configs 兜底 + IDB pack_runtime），再整体覆盖
    await pack.init()

    // player 重建（level/exp/加点 → 属性，覆盖血量能量上限）
    const bonuses = data.player.statBonuses
    const profile = createPlayerProfile({
      level: data.player.level,
      exp: data.player.exp,
      stats: bonuses
        ? {
            available: bonuses.available ?? INITIAL_STAT_POINTS.available,
            strength: bonuses.strength ?? 0,
            vitality: bonuses.vitality ?? 0,
            agility: bonuses.agility ?? 0,
            spirit: bonuses.spirit ?? 0,
          }
        : undefined,
    })
    Object.assign(player.player, profile)
    player.player.maxHp = data.player.hp_max
    player.player.maxEnergy = data.player.energy_max
    // 恢复后满血满能量（存档不持久化当前 hp，只有上限）
    player.player.hp = data.player.hp_max
    player.player.energy = data.player.energy_max
    player.player.attackMin = data.player.base_atk[0]
    player.player.attackMax = data.player.base_atk[1]

    // statPoints
    player.statPoints.available = bonuses?.available ?? INITIAL_STAT_POINTS.available
    player.statPoints.strength = bonuses?.strength ?? 0
    player.statPoints.vitality = bonuses?.vitality ?? 0
    player.statPoints.agility = bonuses?.agility ?? 0
    player.statPoints.spirit = bonuses?.spirit ?? 0

    // currency
    player.currency.copper = data.player.gold
    player.currency.silver = data.player.silver ?? 0
    player.currency.jade = data.player.jade ?? 0

    // inventory（材料/丹药/杂物合并回持有量；装备实例化，不落入 inventory）
    const merged: Record<string, number> = {
      ...data.inventory.materials,
      ...data.inventory.elixirs,
      ...data.inventory.misc,
    }
    // 新档装备实例权威在 equipment_instances；equipments 计数仅为兼容冗余（避免与实例重复生成）
    const hasInstances = Array.isArray(data.equipment_instances) && data.equipment_instances.length > 0
    const instances: GearInstance[] = []
    for (const [id, count] of Object.entries(data.inventory.equipments ?? {})) {
      if (!pack.gearById(id)) {
        merged[id] = count
        continue
      }
      // 旧档（无 equipment_instances）从计数派生裸实例；新档由 equipment_instances 决定
      if (!hasInstances) {
        for (let i = 0; i < count; i++) instances.push(makeInstance(id, [], 0))
      }
    }
    pack.inventory = merged

    if (hasInstances) {
      for (const inst of data.equipment_instances ?? []) {
        if (!pack.gearById(inst.itemId)) continue
        const quality = Number.isInteger(inst.quality) && (inst.quality as number) >= 1 && (inst.quality as number) <= 5 ? (inst.quality as number) : 1
        instances.push({
          instanceId: inst.instanceId,
          itemId: inst.itemId,
          enhance: Number.isFinite(inst.enhance) ? inst.enhance : 0,
          quality,
          qualityFactor: Number.isFinite(inst.qualityFactor) ? (inst.qualityFactor as number) : qualityFactorOf(quality),
          star: Number.isInteger(inst.star) && (inst.star as number) >= 0 ? (inst.star as number) : 0,
          affixes: (inst.affixes ?? []).map((a): GearAffix => ({
            id: a.id,
            attribute: a.attribute,
            modifierType: a.modifierType as GearAffix['modifierType'],
            value: a.value,
          })),
        })
      }
    }
    pack.gearInstances = instances

    // equipment（六槽一一对应：charm 映射 charm）
    // 槽引用为 instanceId → 从背包移入槽；旧档为 itemId → 生成裸实例
    for (const slot of Object.keys(pack.equipped) as Array<keyof typeof pack.equipped>) {
      delete pack.equipped[slot]
    }
    const equipSlot = (key: GearSlotKey, ref: string | null | undefined): void => {
      if (!ref) return
      const byId = pack.gearInstances.find((g) => g.instanceId === ref)
      if (byId) {
        pack.equipped[key] = byId
        pack.gearInstances = pack.gearInstances.filter((g) => g.instanceId !== byId.instanceId)
      } else if (pack.gearById(ref)) {
        pack.equipped[key] = makeInstance(ref, [], 0)
      }
    }
    for (const slot of Object.keys(GEAR_SLOT_LABELS) as GearSlotKey[]) {
      equipSlot(slot, data.equipment[slot])
    }

    // scenes 解锁状态
    const unlockedSet = new Set(data.progress.unlocked_scenes ?? [])
    for (const s of scenes) s.unlocked = unlockedSet.has(s.id) || !s.unlockCondition?.sceneId

    // school（v3.0 流派：恢复已点亮节点 + 技能点 + 出战装备槽）
    const schoolState = data.school
    if (schoolState) {
      for (const s of schools) s.selected = s.id === schoolState.selected
      const learnedSet = new Set(schoolState.learned ?? [])
      for (const s of schools) {
        for (const n of s.nodes) n.learned = learnedSet.has(n.id)
      }
      // 已用技能点以存档为权威（运行时可能有调试加点/重置，节点求和仅作兜底）
      skillPoints.spent = Number.isFinite(schoolState.spent)
        ? Math.min(Math.max(schoolState.spent, 0), skillPoints.max)
        : schools.reduce(
            (sum, s) => sum + s.nodes.filter((n) => n.learned).reduce((acc, n) => acc + n.points, 0),
            0,
          )
      // 累计获得技能点（旧档缺省：>= 已分配且 >= 初始等级点数 4，保证 available 非负）
      const earnedVal = schoolState.earned
      const earned = typeof earnedVal === 'number' && Number.isFinite(earnedVal)
        ? Math.min(Math.max(earnedVal, 0), skillPoints.max)
        : Math.max(skillPoints.spent, 4)
      skillPoints.earned = Math.max(earned, skillPoints.spent)
      // 悟道丹服用次数（旧档缺省 0）
      const pillsVal = schoolState.totalPillsUsed
      skillPoints.totalPillsUsed = typeof pillsVal === 'number' && Number.isFinite(pillsVal)
        ? Math.min(Math.max(pillsVal, 0), PILL_POINT_LIMIT)
        : 0
      // 出战装备槽恢复（校验节点已解锁且类型匹配槽位）
      restoreEquipped(schoolState.equipped)
      // 纯流派加成重算
      pureSchoolBonus.value = calcPureSchool(equippedSkills)
    }

    // 同步行囊运行时落盘（防止旧 pack_runtime 覆盖恢复结果）
    await pack.flush()
  },
}

/** 存档管理器单例（组件统一引用） */
export const saveManager = new SaveManager(xiyouSaveBridge)
