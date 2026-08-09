/**
 * 文件: unified-attrs.ts
 * 功能: 属性快照推演（纯函数）
 * 描述: 统一存档仅携带 initialState.attributes（开战时刻），属性随 attribute_recalc
 *       事件变化。此模块从 initialState 出发，沿事件序应用 attribute_recalc 的
 *       after.final（真实发射端 ParticipantStats）或 fields[].to（demo 旧格式），
 *       重建任意时点的属性快照，供"角色属性"面板反映当前状态而非开战那一刻。
 */

import type { UnifiedArchive, UnifiedEvent } from './unified-archive'

export interface AttrPatch {
  code: string
  value: number
}

/** demo 旧格式缩写 → ATTRIBUTE_CODE（attribute-recalc fields 用大写缩写，如 'ATK'） */
const SHORT_TO_CODE: Record<string, string> = {
  ATK: 'attack',
  DEF: 'defense',
  SPD: 'speed',
  HP: 'currentHealth',
  MAX_HP: 'maxHealth',
  EN: 'currentEnergy',
  MAX_EN: 'maxEnergy',
  CRIT: 'critRate',
  CDMG: 'critDamage',
  DODGE: 'dodge',
  HIT: 'hit',
  DMG_RED: 'damageReduction',
  RES: 'resist',
}

/** 从单个 attribute_recalc 事件提取属性修正（真实 + demo 两种形态） */
export function extractAttrPatches(ev: UnifiedEvent): AttrPatch[] {
  if (ev.phase !== 'attribute_recalc') return []
  const pl = ev.payload ?? {}
  const patches: AttrPatch[] = []
  // 真实发射端（ParticipantStats）：attribute + after.final（标准小写 code）
  if (typeof pl.attribute === 'string' && (pl.after as { final?: unknown })?.final != null) {
    patches.push({ code: pl.attribute, value: Number((pl.after as { final: unknown }).final) })
  }
  // demo 旧格式：fields[{k, from, to}]，k 为大写缩写
  if (Array.isArray(pl.fields)) {
    for (const f of pl.fields as Array<{ k?: unknown; to?: unknown }>) {
      if (typeof f?.k !== 'string' || typeof f.to !== 'number') continue
      const code = SHORT_TO_CODE[f.k] ?? f.k.toLowerCase()
      if (code) patches.push({ code, value: f.to })
    }
  }
  return patches
}

/**
 * 重建 t 时刻的属性快照（id → attributes）。
 * 从 initialState 复制，遍历 timestamp <= t 的 attribute_recalc 应用修正。
 * @returns Map<participantId, Record<code, value>>；无存档返回空 Map
 */
export function deriveAttrsAt(log: UnifiedArchive, evs: UnifiedEvent[], t: number): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>()
  for (const p of log.initialState.participants) {
    if (p.attributes) out.set(p.id, { ...p.attributes })
  }
  for (const ev of evs) {
    if (ev.timestamp > t) break
    const patches = extractAttrPatches(ev)
    if (!patches.length) continue
    // 事件定位持有者：真实发射端 targetId/sourceId 未填，用 payload.entityId；
    // demo 用 sourceId
    const owner = String((ev.payload as Record<string, unknown>)?.entityId ?? ev.sourceId ?? ev.targetId ?? '')
    if (!owner) continue
    const attrs = out.get(owner)
    if (!attrs) continue
    for (const patch of patches) attrs[patch.code] = patch.value
  }
  return out
}
