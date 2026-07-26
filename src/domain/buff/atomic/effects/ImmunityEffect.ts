import type { IAtomicEffect, AtomicEffectType } from '../types'
import type { BuffContext } from '@/domain/buff/BuffContext'

/**
 * ImmunityEffect — 免疫原语
 *
 * 通过 BuffSystem 的 characterImmunities 集合管理。
 * onApply 时注册免疫标签，onRemove 时重建整个角色的免疫集合。
 * 
 * 采用重建策略而非逐个删除，确保已移除 Buff 的免疫标签被正确清理。
 */
export class ImmunityEffect implements IAtomicEffect {
  readonly type: AtomicEffectType = 'immunity'

  onApply(ctx: BuffContext, params: Record<string, unknown>): void {
    const tags = params.tags as string[] | undefined
    if (!tags || tags.length === 0) return

    const buffSystem = ctx.getBuffSystem()
    if (!buffSystem) return

    for (const tag of tags) {
      buffSystem.registerSingleImmunity(ctx.characterId, tag)
    }
  }

  onRemove(ctx: BuffContext, _params: Record<string, unknown>): void {
    const buffSystem = ctx.getBuffSystem()
    if (!buffSystem) return

    // 重建整个角色的免疫集合，移除当前 Buff 的免疫标签
    buffSystem.rebuildCharacterImmunities(ctx.characterId)
  }

  getEffectLines(_ctx: BuffContext, params: Record<string, unknown>) {
    const tags = params.tags as string[] | undefined
    if (tags && tags.length > 0) {
      return [{
        text: `免疫: ${tags.join(', ')}`,
        kind: 'other' as const,
      }]
    }
    return [{ text: '免疫效果', kind: 'other' as const }]
  }
}
