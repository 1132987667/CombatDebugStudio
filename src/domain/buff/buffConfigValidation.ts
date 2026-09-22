/**
 * buffConfigValidation.ts — Buff 配置结构校验（保存时拦截引擎运行期会抛错的坏数据）
 *
 * 与 BuffConfigResolver / BuffSystem 的静默失效点对齐（未知原子效果类型 / polarity 非法或不可
 * 推导 / 无法识别的触发阶段 / 未注册的触发器 scriptId），供封神榜保存 buffs 表时校验，避免坏数据
 * 注入引擎后在战斗中断裂或配置写了不生效。
 * 构造期校验（BuffScriptRegistry.validateBuffConfigs）更严格、且抛错；此处为编辑保存期的宽松提示。
 */

import { AtomicEffectType } from '@/domain/buff/atomic/types'
import { BattleTriggerPhase, OLD_PHASE_NAME_MAP } from '@/domain/battle/type/types'
import { ControlType, StackRule } from '@/domain/buff/types'
import { TRIGGER_SCRIPTS } from '@/domain/buff/triggers/index'
import { StepEffectType } from '@/domain/skill/types'

const ATOMIC_TYPES = new Set<string>(Object.values(AtomicEffectType))
const VALID_POLARITIES = ['positive', 'negative', 'neutral', 'mixed']
const PHASES = new Set<string>(Object.values(BattleTriggerPhase))
// JSON 是无类型外部输入，as StackRule/as ControlType 断言不提供任何检查；
// 此处是坏值进入引擎前的保存期闸门，值域以引擎枚举为单一事实来源
const STACK_RULES = new Set<string>(Object.values(StackRule))
const CONTROL_TYPES = new Set<string>(Object.values(ControlType))
// NOTE: 与 BuffSystem.registerDefaultTriggerScripts 注册集一致——内建三项 + TRIGGER_SCRIPTS 全量。
const TRIGGER_SCRIPT_IDS = new Set<string>([
  ...Object.keys(TRIGGER_SCRIPTS),
  StepEffectType.DEAL_DAMAGE,
  StepEffectType.APPLY_BUFF,
  StepEffectType.HEAL,
])

/**
 * 校验单个 Buff 配置结构（接受 BuffJsonEntry 或归一化后的配置）。
 * 返回可读错误列表；空数组表示结构合法。
 * NOTE: 入参收窄为 object 由本函数内部统一断言，调用方无需逐处 as unknown as
 */
export function validateBuffConfigShape(input: object): string[] {
  const raw = input as Record<string, unknown>
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

  // stackRule / controlType：枚举值域校验（引擎按枚举值 switch/比较，大小写错值会静默漏命中）
  if (raw.stackRule !== undefined && raw.stackRule !== null) {
    if (!STACK_RULES.has(String(raw.stackRule))) {
      errors.push(`「${buffId}」stackRule "${String(raw.stackRule)}" 非法，须为 ${[...STACK_RULES].join('/')}`)
    }
  }
  if (raw.controlType !== undefined && raw.controlType !== null) {
    if (!CONTROL_TYPES.has(String(raw.controlType))) {
      errors.push(`「${buffId}」controlType "${String(raw.controlType)}" 非法，须为引擎控制状态码（${ControlType.NONE} 表示无控制）`)
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
      // scriptId：未知 ID 在引擎侧静默跳过（BuffSystem.triggerScripts.get 落空），
      // 配置写了却不生效最难排查，故在保存期拦住
      const scriptId = tr?.scriptId
      if (typeof scriptId === 'string' && !TRIGGER_SCRIPT_IDS.has(scriptId)) {
        errors.push(`「${buffId}」triggers[${i}].scriptId "${scriptId}" 未注册触发器脚本`)
      }
    }
  }

  return errors
}
