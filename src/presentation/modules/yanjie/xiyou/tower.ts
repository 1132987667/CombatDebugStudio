/**
 * 无尽塔（挑战层，PRD §31 Beta / §22 / §18 的材料来源节点）
 *
 * NOTE: 层 = 等级带直映（层 N 敌人等级 N，封顶 50；隐藏层 51 用 51~60 级妖尊带）。
 *       编成由层数确定性生成（seeded rng，同层编成固定——重复挑战强度可预期）。
 *       挑战走 QuickBattleSim 无头对局（与扫荡同口径），胜利发奖励 + 推进进度。
 * HACK: v1 无头结算无战斗演出；天花板：玩家期望塔层真实战斗（BattleZen 模式），
 *       接 runFlow 节点制跨场血量继承时一并升级。
 */
import { reactive, ref } from 'vue'
import { ParticipantSide } from '@/domain/battle/type/types'
import { persistentStorage } from '@/infrastructure/adapters/storage'
import { FENGSHEN_STORE } from '@/domain/port/IPersistentStorage'
import { createRng, type Rng } from '@/shared/utils/seeded-rng'
import type { Enemy } from '@/shared/types/enemy'
import enemiesJson from '@configs/enemies/enemies.json'

// ===== 配置 =====

export const TOWER_MAX_FLOOR = 50
/** 隐藏层（PRD §31 隐藏 Boss）：通关 50 层解锁，51~60 级妖尊镇守 */
export const TOWER_HIDDEN_FLOOR = TOWER_MAX_FLOOR + 1

/** 普通层每层固定奖励（§31 挑战层：稀有词条/终极材料的投放节点；量级可调） */
export const TOWER_FLOOR_GOLD = 200
export const TOWER_FLOOR_EXP = 150

interface TowerFloorPlan {
  floor: number
  /** 层名（BOSS 层特殊标注） */
  label: string
  /** 敌人 role 编成模式（按优先级挑选） */
  roles: string[]
}

/** 层编成规则（确定性；role 键 = enemies.json role 码） */
export function towerFloorPlan(floor: number): TowerFloorPlan {
  if (floor >= TOWER_HIDDEN_FLOOR) {
    return { floor, label: `第 ${floor} 层 · 无名妖尊（隐藏）`, roles: ['yaozun', 'yaozun', 'yaokui'] }
  }
  if (floor === TOWER_MAX_FLOOR) {
    return { floor, label: `第 ${floor} 层 · 塔顶妖王`, roles: ['yaozun', 'yaowang', 'yaowang'] }
  }
  if (floor % 10 === 0) {
    return { floor, label: `第 ${floor} 层 · 妖王殿`, roles: ['yaowang', 'yaotu', 'yaobing'] }
  }
  if (floor % 5 === 0) {
    return { floor, label: `第 ${floor} 层 · 妖魁关`, roles: ['yaokui', 'xiaoyao', 'yaobing'] }
  }
  return { floor, label: `第 ${floor} 层`, roles: ['xiaoyao', 'yaobing', 'yaotu'] }
}

/** 从等级带候选池按 role 挑一个（确定性 rng；空池放宽等级窗口） */
function pickByRole(pool: Enemy[], role: string, rng: Rng): Enemy | null {
  const matched = pool.filter((e) => e.role === role)
  if (matched.length === 0) return null
  return matched[Math.floor(rng.next() * matched.length)] ?? null
}

/**
 * 塔层敌方编成（确定性：同层固定）。
 * 敌人等级 = min(50, 层数)；候选取目标等级 ±3，按编成 role 模式挑选，缺 role 时以该等级带任意敌人补位。
 */
export function towerEnemiesForFloor(floor: number): Enemy[] {
  const plan = towerFloorPlan(floor)
  // 隐藏层锚定 56 级（51~60 妖尊带中部）；常规层 层≈等级，封顶 50
  const targetLevel = floor >= TOWER_HIDDEN_FLOOR ? 56 : Math.min(50, Math.max(1, floor))
  const all = enemiesJson as unknown as Enemy[]
  let pool = all.filter((e) => Math.abs(e.level - targetLevel) <= 3)
  if (pool.length === 0) pool = all.filter((e) => Math.abs(e.level - targetLevel) <= 8)
  if (pool.length === 0) return []

  const rng = createRng(`tower_floor_${floor}`)
  const out: Enemy[] = []
  const used = new Set<string>()
  for (const role of plan.roles) {
    let picked = pickByRole(pool, role, rng)
    // 缺该 role：从池里任取未用者补位（保证层数编成完整）
    if (!picked) {
      const rest = pool.filter((e) => !used.has(e.id))
      picked = rest[Math.floor(rng.next() * rest.length)] ?? null
    }
    if (picked && !used.has(picked.id)) {
      used.add(picked.id)
      out.push(picked)
    }
  }
  return out
}

/** 塔层通关奖励（§22 灵尘/器灵、§18 突破丹叁的 PRD 来源节点；首次通关额外灵尘） */
export function towerClearRewards(floor: number, firstClear: boolean): { itemId: string; count: number }[] {
  const out: { itemId: string; count: number }[] = []
  if (floor >= 15 && floor % 5 === 0) out.push({ itemId: 'spirit_dust', count: 2 })
  if (floor === 20 || floor === 35) out.push({ itemId: 'spirit_core', count: 1 })
  if (floor === 30 || floor === 50) out.push({ itemId: 'pet_break_pill_3', count: 1 })
  if (floor >= TOWER_HIDDEN_FLOOR) out.push({ itemId: 'spirit_core', count: 3 })
  if (firstClear) out.push({ itemId: 'spirit_dust', count: 2 })
  return out
}

// ===== 进度状态（IDB xiyou 表 'tower' 文档）=====

interface TowerState {
  /** 历史最高通关层 */
  bestFloor: number
}

export const towerState = reactive<TowerState>({ bestFloor: 0 })

/** 进度写回（loadXiyouData 启动时恢复） */
export async function persistTowerState(): Promise<void> {
  try {
    await persistentStorage.set(FENGSHEN_STORE.XIYOU, 'tower', {
      id: 'tower',
      data: { bestFloor: towerState.bestFloor },
      updatedAt: new Date().toISOString(),
    })
  } catch {
    // IDB 不可用时内存态仍可用
  }
}

export async function loadTowerState(): Promise<void> {
  try {
    const doc = await persistentStorage.get<{ data?: Partial<TowerState> }>(FENGSHEN_STORE.XIYOU, 'tower')
    if (doc?.data && typeof doc.data.bestFloor === 'number') {
      towerState.bestFloor = doc.data.bestFloor
    }
  } catch {
    // 读失败保持 0
  }
}

/** 层是否已解锁（顺序推进；隐藏层需通关 50 层） */
export function isTowerFloorUnlocked(floor: number): boolean {
  if (floor >= TOWER_HIDDEN_FLOOR) return towerState.bestFloor >= TOWER_MAX_FLOOR
  return floor <= towerState.bestFloor + 1
}

/** 通关推进（胜利后调用）；返回是否为首通 */
export async function recordTowerClear(floor: number): Promise<boolean> {
  const firstClear = floor > towerState.bestFloor
  if (firstClear) {
    towerState.bestFloor = floor
    await persistTowerState()
  }
  return firstClear
}

/** 当前可挑战的最高层（UI 主按钮） */
export function nextTowerFloor(): number {
  return Math.min(TOWER_HIDDEN_FLOOR, towerState.bestFloor + 1)
}
