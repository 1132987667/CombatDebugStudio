/**
 * save-bridge.ts — 演劫台存档端口实现
 *
 * 将运行时状态（playerStore / packStore / scenes）映射为 SaveData v2.0.0 并反向恢复。
 * 与 SaveManager（shared/utils/save-manager.ts）解耦：此处持有 store 依赖，manager 保持纯编排。
 *
 * 映射要点：
 * - 货币双币种 → player.money/xianyuan（v6 收缩：旧档 gold/silver/jade 按换算合并恢复）
 * - 装备 6 槽（weapon/armor/helmet/boots/charm/glove）一一对应
 * - 物品按 type 分类到 inventory 四类（装备 → equipments，材料/丹药 → materials/elixirs，其余 → misc）
 */

import { createInitialGameState, type SaveData, type SaveEquipmentInstance, type SavePlayerState } from '@/shared/utils/save-schema'
import { calculateChecksum } from '@/shared/utils/Checksum'
import type { SaveStatePort } from '@/shared/utils/save-manager'
import { SaveManager } from '@/shared/utils/save-manager'
import { persistentStorage } from '@/infrastructure/adapters/storage'
import { container } from '@/infrastructure/di/Container'
import { GameDataApi } from '@/application/service/GameDataApi'
import type { XiyouStatPoints } from './types'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import {
  GEAR_SLOT_LABELS,
  makeInstance,
  usePackStore,
  type GearAffix,
  type GearInstance,
  type GearSlotKey,
} from '@/presentation/stores/packStore'
import { materials as packMaterials, equipment as packStarterEquipment, starterEnabled, packItems, pills as packPills, consumables as packConsumables, quests, scenes, schools, schoolsLayers, mates, skillPoints, equippedSkills, skillNodeMap, pureSchoolBonus, calcPureSchool, nodeRankCost, PILL_POINT_LIMIT } from './xiyouData'
import { qualityFactorOf } from './quality'
import { createPlayerProfile } from './playerProfile'

const INITIAL_STAT_POINTS: XiyouStatPoints = { available: 4, hp: 0, atk: 0, def: 0, hit: 0, dodge: 0, speed: 0 }

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
    out.push({ instanceId: g.instanceId, itemId: g.itemId, enhance: g.enhance, enhanceFails: g.enhanceFails ?? 0, quality: g.quality, qualityFactor: g.qualityFactor, star: g.star ?? 0, affixes: g.affixes.map((a) => ({ ...a })) })
  }
  for (const slot of Object.keys(GEAR_SLOT_LABELS) as GearSlotKey[]) {
    const inst = pack.equipped[slot]
    if (inst) {
      out.push({ instanceId: inst.instanceId, itemId: inst.itemId, enhance: inst.enhance, enhanceFails: inst.enhanceFails ?? 0, quality: inst.quality, qualityFactor: inst.qualityFactor, star: inst.star ?? 0, affixes: inst.affixes.map((a) => ({ ...a })) })
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
  /**
   * 新游戏初始态：pack.json 初始持有整组并入（与 buildFromConfigs 同源口径）——
   * - materials/pills/consumables → inventory 三类（restore 合并回背包）
   * - equipment 组（新手装备套，starterEnabled 门禁）→ equipments 计数，
   *   restore 从计数派生裸实例（无 equipment_instances 分支）
   * NOTE: buildFromConfigs 只在行囊首次 init 时跑一次，reset→restore 会整表覆盖，
   *       新档初始量必须走这里，不能指望 configs 兜底。
   */
  createInitial(): SaveData {
    const data = createInitialGameState()
    for (const [target, group] of [
      [data.inventory.materials, packMaterials],
      [data.inventory.elixirs, packPills],
      [data.inventory.misc, packConsumables],
    ] as const) {
      for (const item of group) {
        const id = PACK_NAME_TO_ID.get(item.name)
        if (id) target[id] = (target[id] ?? 0) + item.count
      }
    }
    if (starterEnabled.value) {
      for (const item of packStarterEquipment) {
        data.inventory.equipments[item.itemId] = (data.inventory.equipments[item.itemId] ?? 0) + item.count
      }
    }
    return data
  },

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
    data.player.money = player.currency.money
    data.player.xianyuan = player.currency.xianyuan
    data.player.break_stage = player.player.breakStage ?? 0
    data.player.statBonuses = {
      available: player.statPoints.available,
      hp: player.statPoints.hp,
      atk: player.statPoints.atk,
      def: player.statPoints.def,
      hit: player.statPoints.hit,
      dodge: player.statPoints.dodge,
      speed: player.statPoints.speed,
    }

    // progress
    const unlocked = scenes.filter((s) => s.unlocked)
    data.progress.unlocked_scenes = unlocked.map((s) => s.id)
    data.progress.max_scene = unlocked.length
    const current = currentSceneId ? scenes.find((s) => s.id === currentSceneId) : undefined
    data.progress.current_scene = current?.id ?? unlocked[0]?.id ?? ''
    // 场景星级（历史最高；全 0 时省略字段保持存档紧凑）
    const starred = scenes.filter((s) => s.stars > 0)
    if (starred.length > 0) {
      data.progress.scene_stars = Object.fromEntries(starred.map((s) => [s.id, s.stars]))
    }

    // 任务进度（结构化任务：id + goal 齐全才记录；全初始态时省略字段）
    const questSaved: NonNullable<SaveData['quest_progress']> = {}
    for (const q of quests) {
      if (!q.id || !q.goal) continue
      questSaved[q.id] = { progress: q.progress, ...(q.claimed ? { claimed: true } : {}) }
    }
    if (Object.keys(questSaved).length > 0) data.quest_progress = questSaved

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
    const oldLearned = schools.flatMap((s) => s.nodes.filter((n) => n.learned).map((n) => n.id))
    // 流派树（schools.json）节点级数（多级属性节点；learned 派生自 ranks>0）
    const treeRanks: Record<string, number> = {}
    for (const layer of schoolsLayers) {
      for (const n of layer.nodes) {
        if (n.ranks > 0) treeRanks[n.id] = n.ranks
      }
    }
    data.school = {
      selected: null,
      learned: [...oldLearned, ...Object.keys(treeRanks)],
      tree_ranks: treeRanks,
      spent: skillPoints.spent,
      earned: skillPoints.earned,
      totalPillsUsed: skillPoints.totalPillsUsed,
      equipped: {
        passive: [...equippedSkills.passive],
        small: [...equippedSkills.small],
        ultimate: equippedSkills.ultimate,
      },
    }

    // 永久丹药服用计数与属性累计增量
    data.pill_uses = { ...pack.pillUses }
    data.pill_bonuses = { ...pack.pillBonuses }

    // 上阵伙伴名单（出战阵容 = 主角 + 至多 3 名上阵伙伴）
    data.mates_active = mates.filter((m) => m.active).map((m) => m.name)

    return data
  },

  async restore(data): Promise<void> {
    const player = usePlayerStore()
    const pack = usePackStore()
    // 确保行囊已 init（configs 兜底 + IDB pack_runtime），再整体覆盖
    await pack.init()

    // player 重建（level/exp/加点 → 属性，覆盖血量法力上限）
    const bonuses = data.player.statBonuses
    // v7 六维加点：旧四维档（strength/vitality/agility/spirit）已投点数退还为 available 重分
    const legacySpent =
      (bonuses?.strength ?? 0) + (bonuses?.vitality ?? 0) + (bonuses?.agility ?? 0) + (bonuses?.spirit ?? 0)
    const restoredStats: XiyouStatPoints = {
      available: (bonuses?.available ?? INITIAL_STAT_POINTS.available) + legacySpent,
      hp: bonuses?.hp ?? 0,
      atk: bonuses?.atk ?? 0,
      def: bonuses?.def ?? 0,
      hit: bonuses?.hit ?? 0,
      dodge: bonuses?.dodge ?? 0,
      speed: bonuses?.speed ?? 0,
    }
    const profile = createPlayerProfile({
      level: data.player.level,
      exp: data.player.exp,
      stats: restoredStats,
      // 突破阶次：旧档缺省按当前等级宽大补齐（已到达的 10 的倍数节点视为已突破，不受新机制惩罚）
      breakStage: data.player.break_stage ?? Math.floor(data.player.level / 10),
    })
    Object.assign(player.player, profile)
    player.player.maxHp = data.player.hp_max
    player.player.maxEnergy = data.player.energy_max
    // 恢复后满血满法力（存档不持久化当前 hp，只有上限）
    player.player.hp = data.player.hp_max
    player.player.energy = data.player.energy_max
    player.player.attackMin = data.player.base_atk[0]
    player.player.attackMax = data.player.base_atk[1]

    // statPoints
    Object.assign(player.statPoints, restoredStats)

    // currency（v6 货币收缩：旧档 gold/silver/jade 按 curr_001 换算 1:1/×100/×1000 合并为金钱；lingyun → 灵韵）
    const legacyCurrency = data.player as SavePlayerState & { gold?: number; silver?: number; jade?: number; lingyun?: number }
    if (typeof data.player.money === 'number') {
      player.currency.money = data.player.money
    } else {
      player.currency.money =
        (legacyCurrency.gold ?? 0) + (legacyCurrency.silver ?? 0) * 100 + (legacyCurrency.jade ?? 0) * 1000
    }
    player.currency.xianyuan = data.player.xianyuan ?? legacyCurrency.lingyun ?? player.currency.xianyuan

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
    // v5 药园（灵韵催熟制）迁移：上面整表覆盖会抹掉 packStore.load 时补发的启动草药，覆盖后需再补一次
    pack.migrateV5StarterHerbs()

    if (hasInstances) {
      for (const inst of data.equipment_instances ?? []) {
        if (!pack.gearById(inst.itemId)) continue
        const quality = Number.isInteger(inst.quality) && (inst.quality as number) >= 1 && (inst.quality as number) <= 5 ? (inst.quality as number) : 1
        instances.push({
          instanceId: inst.instanceId,
          itemId: inst.itemId,
          enhance: Number.isFinite(inst.enhance) ? inst.enhance : 0,
          enhanceFails: Number.isInteger(inst.enhanceFails) && (inst.enhanceFails as number) >= 0 ? (inst.enhanceFails as number) : 0,
          quality,
          qualityFactor: Number.isFinite(inst.qualityFactor) ? (inst.qualityFactor as number) : qualityFactorOf(quality),
          star: Number.isInteger(inst.star) && (inst.star as number) >= 0 ? (inst.star as number) : 0,
          // 旧档无锁存核心属性（写死 stats 时代）→ 按公式补 roll 一次
          stats: makeInstance(inst.itemId, [], 0, quality, Number.isFinite(inst.qualityFactor) ? (inst.qualityFactor as number) : qualityFactorOf(quality)).stats,
          affixes: (inst.affixes ?? []).map((a): GearAffix => ({
            id: a.id,
            // HACK: 存档词缀的 attribute 为历史持久化字符串（SaveEquipmentInstance 保持宽容键域），
            //       写入时由 configs 词条库生成，按配置契约视为合法属性码
            attribute: a.attribute as GearAffix['attribute'],
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

    // scenes 星级（旧档无此字段保持 0；越界值钳制到 0~3 防脏档污染首杀/星级展示）
    const starsSaved = data.progress.scene_stars
    for (const s of scenes) s.stars = Math.max(0, Math.min(3, starsSaved?.[s.id] ?? 0))

    // 任务进度恢复（旧档无此字段保留 configs 初始值）
    const questSavedMap = data.quest_progress
    if (questSavedMap) {
      for (const q of quests) {
        const saved = q.id ? questSavedMap[q.id] : undefined
        if (!saved) continue
        q.progress = Math.max(0, saved.progress)
        q.claimed = !!saved.claimed
      }
    }

    // school（v3.0 流派：恢复已点亮节点 + 技能点 + 出战装备槽）
    const schoolState = data.school
    if (schoolState) {
      for (const s of schools) s.selected = s.id === schoolState.selected
      const learnedSet = new Set(schoolState.learned ?? [])
      for (const s of schools) {
        for (const n of s.nodes) n.learned = learnedSet.has(n.id)
      }
      // 流派树（schools.json）节点恢复：级数以 tree_ranks 为权威；旧档无 tree_ranks 按 learned 每节点 1 级
      const treeRanksSaved = schoolState.tree_ranks ?? {}
      for (const layer of schoolsLayers) {
        for (const node of layer.nodes) {
          const saved = treeRanksSaved[node.id]
          node.ranks = Number.isInteger(saved) && saved > 0 ? saved : learnedSet.has(node.id) ? 1 : 0
        }
      }
      // 已用技能点以存档为权威（运行时可能有调试加点/重置，节点求和仅作兜底）
      skillPoints.spent = Number.isFinite(schoolState.spent)
        ? Math.min(Math.max(schoolState.spent, 0), skillPoints.max)
        : schools.reduce(
            (sum, s) => sum + s.nodes.filter((n) => n.learned).reduce((acc, n) => acc + n.points, 0),
            0,
          ) + schoolsLayers.reduce(
            (sum, l) => sum + l.nodes.reduce((acc, n) => acc + n.ranks * nodeRankCost(n, 1), 0),
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

    // 永久丹药：服用计数（上限校验权威）+ 属性增量叠回。
    // NOTE: maxHp/attackMin 的丹药增量已包含在 hp_max/base_atk 绝对值里（上方 player 重建时覆盖），
    //       再叠加会双算，故跳过；defense/speed/hitRate/dodgeRate 无存档通道，必须在此补齐。
    pack.pillUses = { ...(data.pill_uses ?? {}) }
    for (const [attr, val] of Object.entries(data.pill_bonuses ?? {})) {
      if (!Number.isFinite(val) || attr === 'maxHp' || attr === 'attackMin') continue
      const key = attr as keyof typeof player.player
      if (typeof player.player[key] === 'number') {
        ;(player.player as unknown as Record<string, number>)[key] = (player.player[key] as number) + (val as number)
      }
    }

    // 上阵伙伴恢复（缺省保留 mate.json 初始 active）
    const matesActive = data.mates_active
    if (Array.isArray(matesActive)) {
      const activeSet = new Set(matesActive)
      for (const m of mates) m.active = activeSet.has(m.name)
    }

    // 同步行囊运行时落盘（防止旧 pack_runtime 覆盖恢复结果）
    await pack.flush()
  },
}

/** 存档管理器单例（组件统一引用） */
export const saveManager = new SaveManager(xiyouSaveBridge, persistentStorage, loadConfigsFingerprint)

/**
 * 当前配置指纹（存档 meta.configs_fp）：对封神榜 IDB 中西游域配置全集做内容 hash。
 * HACK: 口径只覆盖 xiyou 域，不含封神榜战斗表（enemies/skills/buffs）——演劫台主要玩法数据
 *       已够用；哪天需要覆盖战斗表，升级口径并把前缀 `xiyou-v1:` 升版本号，旧档指纹自然失配降级为无提示。
 */
async function loadConfigsFingerprint(): Promise<string | undefined> {
  try {
    const api = container.resolve<GameDataApi>('GameDataApi')
    const records = await api.listXiyouData()
    if (!records.length) return undefined
    const canonical = records
      .map((r) => ({ id: r.id, data: r.data }))
      .sort((a, b) => a.id.localeCompare(b.id))
    return `xiyou-v1:${calculateChecksum(canonical)}`
  } catch {
    return undefined // 容器未初始化（如单测环境）：无指纹，导入侧跳过比对
  }
}
