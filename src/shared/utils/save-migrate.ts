/**
 * save-migrate.ts — 存档版本迁移
 *
 * 迁移注册表按版本号升序执行（PRD §5.4）。当前实现 v1.x → v2.0.0 的装备槽位迁移：
 * necklace + crown → helmet（取非空优先，另一件入背包防丢失）、belt → boots、bracelet → charm。
 * 旧档字段缺失 / 结构不同时以初始状态兜底合并，不抛错（静默迁移，PRD §11.4）。
 */

import {
  createInitialGameState,
  SAVE_VERSION,
  type SaveData,
} from './save-schema'

function toRecord(v: unknown): Record<string, number> {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return { ...(v as Record<string, number>) }
  }
  if (Array.isArray(v)) {
    const out: Record<string, number> = {}
    for (const id of v) if (typeof id === 'string') out[id] = (out[id] ?? 0) + 1
    return out
  }
  return {}
}

/**
 * v1.x → v2.0.0：8 槽 → 6 槽装备迁移。
 * 旧档无品质字段，「取品质较高者」退化为取非空者（necklace 优先），另一件移入背包防丢失。
 */
export function migrateEquipmentSlots(oldSave: unknown): SaveData {
  const base = createInitialGameState()
  const old = (oldSave && typeof oldSave === 'object' ? oldSave : {}) as Record<string, unknown>
  const oldEquip = (isObj(old.equipment) ? old.equipment : {}) as Record<string, unknown>
  const asId = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

  const necklace = asId(oldEquip.necklace)
  const crown = asId(oldEquip.crown)
  // 取品质较高者：无品质字段时项链优先（necklace 为主），另一件入背包
  const helmet = necklace ?? crown

  // 未映射的旧饰品移入背包，防止资产丢失
  const lost = [necklace, crown].filter((id): id is string => !!id && id !== helmet)

  const equipments = toRecord(old.inventory && isObj(old.inventory) ? old.inventory.equipments : undefined)
  for (const id of lost) equipments[id] = (equipments[id] ?? 0) + 1

  const oldPlayer = (isObj(old.player) ? old.player : {}) as Record<string, unknown>
  const oldProgress = (isObj(old.progress) ? old.progress : {}) as Record<string, unknown>

  return {
    ...base,
    ...old,
    meta: {
      ...base.meta,
      ...(isObj(old.meta) ? old.meta : {}),
      version: SAVE_VERSION,
    },
    player: {
      ...base.player,
      ...oldPlayer,
      statBonuses: { ...(toRecord(oldPlayer.statBonuses)) },
    },
    progress: {
      ...base.progress,
      ...oldProgress,
      unlocked_scenes: Array.isArray(oldProgress.unlocked_scenes)
        ? oldProgress.unlocked_scenes.map(String)
        : [],
    },
    inventory: {
      materials: toRecord(isObj(old.inventory) ? old.inventory.materials : undefined),
      equipments,
      elixirs: toRecord(isObj(old.inventory) ? old.inventory.elixirs : undefined),
      misc: toRecord(isObj(old.inventory) ? old.inventory.misc : undefined),
    },
    equipment: {
      weapon: asId(oldEquip.weapon),
      armor: asId(oldEquip.armor),
      helmet,
      boots: asId(oldEquip.belt),
      charm: asId(oldEquip.bracelet),
      glove: asId(oldEquip.ring),
    },
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** 迁移注册表（按版本号升序执行；未来版本在此追加） */
export const MIGRATIONS: Record<string, (old: unknown) => SaveData> = {
  '1.0.0_to_2.0.0': migrateEquipmentSlots,
}

/** 迁移入口：当前版本直接返回；旧版 / 无版本走 v1 → v2 迁移链（当前仅一条） */
export function migrateSave(raw: unknown): SaveData {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const version = isObj(data.meta) ? data.meta.version : undefined
  if (version === SAVE_VERSION) return data as unknown as SaveData
  return migrateEquipmentSlots(data)
}
