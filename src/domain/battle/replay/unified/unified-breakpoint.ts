/**
 * 文件: unified-breakpoint.ts
 * 功能: 条件断点判定（纯函数）
 * 描述: 依据《调试日志UI示例.html》条件断点能力（伤害≥阈值/级别/随机值>阈值/单位行动），
 *       抽取为无副作用纯函数，供 store 播放循环命中检测与单测。
 *       支持多条断点，每条自带启用开关；命中任一启用断点即暂停。
 */

import type { UnifiedEvent } from './unified-archive'

export interface BreakpointConfig {
  /** 断点唯一 id（列表管理与持久化用） */
  id: string
  type: 'none' | 'damage' | 'level' | 'roll' | 'actor'
  value?: number | string
  enabled: boolean
}

/** 新建断点（随机短 id） */
export function createBreakpoint(
  type: BreakpointConfig['type'],
  value: number | string | undefined,
): BreakpointConfig {
  return { id: `bp_${Math.random().toString(36).slice(2, 8)}`, type, value, enabled: true }
}

/** 事件是否命中该断点条件（未启用或 type 为 none 恒不命中） */
export function checkBreakpointHit(ev: UnifiedEvent, bp: BreakpointConfig): boolean {
  if (!bp.enabled || bp.type === 'none') return false
  const pl = ev.payload ?? {}
  switch (bp.type) {
    case 'damage':
      return ev.phase === 'damage_calculation' && typeof pl.result === 'number' && pl.result >= (bp.value as number)
    case 'level':
      return ev.level === bp.value
    case 'roll': {
      const rolls = pl.rolls as Array<{ roll?: number }> | undefined
      return !!rolls?.some((r) => typeof r.roll === 'number' && r.roll > (bp.value as number))
    }
    case 'actor':
      return ev.sourceId === bp.value || ev.targetId === bp.value
    default:
      return false
  }
}

/** 事件是否命中断点列表中的任一启用断点 */
export function checkAnyBreakpointHit(ev: UnifiedEvent, bps: BreakpointConfig[]): boolean {
  for (const bp of bps) {
    if (checkBreakpointHit(ev, bp)) return true
  }
  return false
}
