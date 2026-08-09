/**
 * buffConfigValidation.ts — Buff 配置结构校验（保存时拦截引擎运行期会抛错的坏数据）
 *
 * 与 BuffConfigResolver 的抛错点对齐（未知原子效果类型 / polarity 非法或不可推导 /
 * 无法识别的触发阶段），供封神榜保存 buffs 表时校验，避免坏数据注入引擎后在战斗中断裂。
 * 构造期校验（BuffScriptRegistry.validateBuffConfigs）更严格、且抛错；此处为编辑保存期的宽松提示。
 */

import { AtomicEffectType } from '@/domain/buff/atomic/types'
import { BattleTriggerPhase, OLD_PHASE_NAME_MAP } from '@/domain/battle/type/types'

const ATOMIC_TYPES = new Set<string>(Object.values(AtomicEffectType))
const VALID_POLARITIES = ['positive', 'negative', 'neutral', 'mixed']
const PHASES = new Set<string>(Object.values(BattleTriggerPhase))

/**
 * 校验单个 Buff 配置结构（接受 BuffJsonEntry 或归一化后的配置）。
 * 返回可读错误列表；空数组表示结构合法。
 */
export function validateBuffConfigShape(raw: Record<string, unknown>): string[] {
  const errors: string[] = []
  const buffId = String(raw.id ?? 'unknown')

  // polarity：存在则值域校验；缺失时须能从 controlType/tags 推导（与 BuffConfigResolver 一致）
  if (raw.polarity !== undefined && raw.polarity !== null) {
    if (!VALID_POLARITIES.includes(String(raw.polarity))) {
      errors.push(`「${buffId}」polarity "${String(raw.polarity)}" 非法，须为 ${VALID_POLARITIES.join('/')}`)
    }
  } else {
    const derivable =
      (raw.controlType !== undefined && raw.controlType !== null && raw.controlType !== 'none') ||
      (Array.isArray(raw.tags) &&
        (raw.tags as unknown[]).some((t) => t === 'dot' || t === 'poison' || t === 'debuff'))
    if (!derivable) {
      errors.push(`「${buffId}」缺少 polarity 字段，且无法从 controlType/tags 推导`)
    }
  }

  // effects[].type：须为合法原子效果类型
  if (Array.isArray(raw.effects)) {
    for (const [i, eff] of (raw.effects as Array<Record<string, unknown>>).entries()) {
      const type = eff?.type
      if (type === undefined || type === null) {
        errors.push(`「${buffId}」effects[${i}] 缺少 type 字段`)
      } else if (!ATOMIC_TYPES.has(String(type))) {
        errors.push(
          `「${buffId}」effects[${i}].type "${String(type)}" 未知，须为 ${Object.values(AtomicEffectType).join('/')}`,
        )
      }
    }
  }

  // triggers[].phase：须为合法触发阶段（含旧名映射）
  if (Array.isArray(raw.triggers)) {
    for (const [i, tr] of (raw.triggers as Array<Record<string, unknown>>).entries()) {
      const phase = tr?.phase
      if (typeof phase === 'string' && !PHASES.has(phase) && !OLD_PHASE_NAME_MAP[phase]) {
        errors.push(`「${buffId}」triggers[${i}].phase "${phase}" 无法识别`)
      }
    }
  }

  return errors
}
