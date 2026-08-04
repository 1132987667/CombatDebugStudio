/**
 * elementMatrix.ts — 阵营元素克制系数解析（封神榜开发计划 §M2-6 / 规格说明书 §3.7）
 *
 * 纯函数：按攻击方 vs 防御方阵营查克制矩阵，无匹配时返回默认系数。
 * DamageCalculator / HitCalculator 消费；faction 缺失或矩阵未配置时返回默认值（不影响现有战斗）。
 */

import type { ElementMatrixRow } from '@/domain/fengshen/types'

export interface ElementMatrixLike {
  matrix: ElementMatrixRow[]
  defaultCoefficient: number
}

export function resolveElementCoefficient(
  elementMatrix: ElementMatrixLike | undefined,
  attackerFaction: string | undefined,
  defenderFaction: string | undefined,
): number {
  // faction 任一缺失（或未配置矩阵）即不参与克制，恒 1.0；
  // defaultCoefficient 仅用于"双方都有阵营但矩阵无匹配"。
  if (!attackerFaction || !defenderFaction || !elementMatrix) return 1.0
  const row = elementMatrix.matrix.find(
    (m) => m.attackerId === attackerFaction && m.defenderId === defenderFaction,
  )
  return row?.coefficient ?? elementMatrix.defaultCoefficient
}
