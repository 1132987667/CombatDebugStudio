/**
 * 文件: LogTooltipResolver.ts
 * 功能: 日志悬浮卡片数据解析器
 * 描述: 输入 LogSegmentHover {kind, id}，输出结构化卡片数据供 EntityTooltip 渲染。
 *       处理三种实体类型（buff/skill/passive），各自有不同的数据链。
 *
 * 核心机制：
 * - 描述反查：buffs.json 大多没有 description，但 skill_passive.json 有。
 *   通过反向索引 buffId → SkillConfig[] 获取技能描述作为 buff 的说明文本。
 * - 三级回退：buff.description → 反查技能.description → 按结构自动生成
 */

import { LogSegmentHover, LogSegmentHoverKind } from '@/shared/types/battle-log'
import { classifyBuff, getBuffCategoryBadge, BUFF_CATEGORY, type BuffCategory } from '@/shared/types/buff-classification'
import type { BuffJsonEntry, BuffJsonAuraModifier } from '@/shared/types/buffs-json'
import type { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import type { SkillManager } from '@/domain/skill/SkillManager'
import { SkillConfig, SkillType } from '@/domain/skill/types'

// ==================== 输出类型 ====================

/** Tooltip 卡片的明细行 */
export interface TooltipDetailRow {
  label: string
  value: string
}

/** Tooltip 卡片数据 */
export interface TooltipData {
  /** 实体名称 */
  name: string
  /** 实体描述 */
  description: string
  /** 类型徽章（如 "光环"、"控制"、"被动"） */
  badge: string
  /** 时长徽章（如 "永久"、"3回合"） */
  durationLabel?: string
  /** 明细行列表 */
  details: TooltipDetailRow[]
  /** 来源脚注（可选） */
  source?: string
}

// ==================== Resolver ====================

export class LogTooltipResolver {
  private buffRegistry: BuffScriptRegistry
  private skillManager: SkillManager

  /** 反向索引：buffId → SkillConfig[]（延迟构建） */
  private buffToSkillIndex: Map<string, SkillConfig[]> | null = null

  constructor(buffRegistry: BuffScriptRegistry, skillManager: SkillManager) {
    this.buffRegistry = buffRegistry
    this.skillManager = skillManager
  }

  /**
   * 根据 hover 元数据解析 Tooltip 数据
   */
  resolve(hover: LogSegmentHover): TooltipData | null {
    switch (hover.kind) {
      case LogSegmentHoverKind.BUFF:
        return this.resolveBuff(hover.id)
      case LogSegmentHoverKind.SKILL:
        return this.resolveSkill(hover.id)
      case LogSegmentHoverKind.PASSIVE:
        return this.resolvePassive(hover.id)
      default:
        return null
    }
  }

  // ==================== Buff ====================

  private resolveBuff(buffId: string): TooltipData | null {
    const config = this.buffRegistry.getBuffConfig(buffId)
    if (!config) {
      return {
        name: buffId,
        description: '未找到配置',
        badge: '未知',
        details: [],
      }
    }

    const name = config.name ?? config.id ?? buffId
    // 合并已解析的 effectPlan，让 deriveBuffFacets 走数据驱动分支（而非旧字段回退）
    const resolved = this.buffRegistry.getResolvedBuffConfig(buffId)
    const classification = classifyBuff(
      resolved ? { ...config, effectPlan: resolved.effectPlan } : config,
    )
    const badge = getBuffCategoryBadge(classification)
    const durationLabel = this.formatDuration(config.duration)

    // 描述：三级回退
    const description = this.resolveBuffDescription(buffId, config, classification.category)

    // 明细行
    const details: TooltipDetailRow[] = []
    this.appendBuffDetails(details, config, classification.category)

    // 来源
    const source = this.resolveBuffSource(buffId)

    return { name, description, badge, durationLabel, details, source }
  }

  /**
   * 三级描述回退：
   *   ① buff 配置自带 description
   *   ② 反向索引 → 技能 description（去掉"被动效果："前缀）
   *   ③ 按结构自动生成
   */
  private resolveBuffDescription(
    buffId: string,
    config: BuffJsonEntry,
    category: BuffCategory,
  ): string {
    // ①
    if (config.description && typeof config.description === 'string' && config.description.trim()) {
      return this.cleanDescription(config.description)
    }

    // ②
    const sourceSkills = this.getBuffSourceSkills(buffId)
    if (sourceSkills.length > 0) {
      for (const skill of sourceSkills) {
        if (skill.description && skill.description.trim()) {
          return this.cleanDescription(skill.description)
        }
      }
    }

    // ③ 自动生成
    return this.generateAutoDescription(config, category)
  }

  /** 去掉"被动效果："前缀 */
  private cleanDescription(desc: string): string {
    return desc.replace(/^被动效果：/, '').trim()
  }

  /** 按结构自动生成描述 */
  private generateAutoDescription(config: BuffJsonEntry, category: BuffCategory): string {
    switch (category) {
      case BUFF_CATEGORY.AURA: {
        const aura = config.aura
        if (aura?.modifiers?.length) {
          const items = aura!.modifiers.map(
            (m) => `${m.targetAttribute ?? ''} ${this.formatModifierValue(m)}`,
          ).filter(Boolean).join('、')
          const scope = aura!.targetSelector === 'allies' ? '全体友方' : aura!.targetSelector === 'enemies' ? '全体敌方' : '自身'
          return `提升 ${scope} ${items}`
        }
        return '光环效果'
      }
      case BUFF_CATEGORY.MODIFIER: {
        const attrs = config.attributes
        if (attrs) {
          return Object.entries(attrs).map(([k, v]) => `${k} ${v}`).join('、')
        }
        return '属性修正'
      }
      case BUFF_CATEGORY.CONTROL:
        return '无法行动'
      case BUFF_CATEGORY.DOT:
        return '每回合造成持续伤害'
      case BUFF_CATEGORY.SHIELD:
        return '吸收伤害'
      case BUFF_CATEGORY.TRIGGER:
        return '满足条件时触发效果'
      default:
        return config.name ?? '未知效果'
    }
  }

  private appendBuffDetails(
    details: TooltipDetailRow[],
    config: BuffJsonEntry,
    category: BuffCategory,
  ): void {
    switch (category) {
      case BUFF_CATEGORY.AURA: {
        const aura = config.aura
        if (aura) {
          const scope = aura.targetSelector === 'allies' ? '全体友方' : aura.targetSelector === 'enemies' ? '全体敌方' : '自身'
          details.push({ label: '生效范围', value: scope })
          if (aura.modifiers?.length) {
            for (const m of aura.modifiers) {
              details.push({
                label: m.targetAttribute ?? '属性',
                value: this.formatModifierValue(m),
              })
            }
          }
        }
        break
      }
      case BUFF_CATEGORY.MODIFIER: {
        const attrs = config.attributes
        if (attrs) {
          for (const [key, value] of Object.entries(attrs)) {
            details.push({ label: key, value: String(value) })
          }
        }
        break
      }
      case BUFF_CATEGORY.TRIGGER: {
        const triggers = config.triggers
        if (triggers?.length) {
          for (const t of triggers!) {
            details.push({
              label: '触发时机',
              value: t.phase ?? t.scriptId ?? '未知',
            })
            if (t.params?.probability != null) {
              details.push({ label: '触发概率', value: `${Math.round((t.params.probability as number) * 100)}%` })
            }
          }
        }
        break
      }
      case BUFF_CATEGORY.CONTROL: {
        details.push({ label: '效果', value: '无法行动' })
        break
      }
      case BUFF_CATEGORY.DOT: {
        details.push({ label: '类型', value: '持续伤害' })
        break
      }
      case BUFF_CATEGORY.SHIELD: {
        details.push({ label: '类型', value: '护盾吸收' })
        break
      }
      case BUFF_CATEGORY.IMMUNITY: {
        const immunities = config.immunities
        if (immunities?.length) {
          details.push({ label: '免疫列表', value: immunities!.join('、') })
        }
        break
      }
    }
  }

  private resolveBuffSource(buffId: string): string | undefined {
    const sourceSkills = this.getBuffSourceSkills(buffId)
    if (sourceSkills.length > 0) {
      const names = sourceSkills.map((s) => s.name).filter(Boolean)
      if (names.length > 0) {
        return `来源：${names.join('、')}`
      }
    }
    return undefined
  }

  // ==================== Skill ====================

  private resolveSkill(skillId: string): TooltipData | null {
    const config = this.skillManager.getSkillConfig(skillId)
    if (!config) {
      return { name: skillId, description: '未找到配置', badge: '技能', details: [] }
    }

    const details: TooltipDetailRow[] = []
    details.push({ label: '能量消耗', value: `${config.energyCost}` })
    if (config.cooldown > 0) {
      details.push({ label: '冷却', value: `${config.cooldown} 回合` })
    }
    const targetCount = config.selector?.count
    if (targetCount != null && targetCount !== 'all') {
      details.push({ label: '目标数', value: `${targetCount}` })
    }

    return {
      name: config.name,
      description: config.description ?? '',
      badge: config.skillType === 'ultimate' ? '终极技' : '技能',
      durationLabel: config.cooldown > 0 ? `${config.cooldown}回合冷却` : undefined,
      details,
    }
  }

  // ==================== Passive ====================

  private resolvePassive(skillId: string): TooltipData | null {
    const config = this.skillManager.getSkillConfig(skillId)
    if (!config) {
      return { name: skillId, description: '未找到配置', badge: '被动', details: [] }
    }

    const details: TooltipDetailRow[] = []

    // 触发时机
    if (config.triggerTimes && config.triggerTimes.length > 0) {
      details.push({ label: '触发时机', value: config.triggerTimes.join('、') })
    }

    // 触发概率（从 parameters 或 steps 中推测）
    const probability = config.parameters?.triggerProbability ?? config.parameters?.probability
    if (probability != null) {
      details.push({ label: '触发概率', value: `${Math.round(probability * 100)}%` })
    }

    if (config.cooldown > 0) {
      details.push({ label: '冷却', value: `${config.cooldown} 回合` })
    }

    return {
      name: config.name,
      description: config.description ?? '',
      badge: '被动',
      details,
    }
  }

  // ==================== 辅助方法 ====================

  /** 格式化修饰符值 */
  private formatModifierValue(modifier: BuffJsonAuraModifier): string {
    if (modifier.value == null) return ''
    const pct = Math.round(modifier.value * 100)
    const type = modifier.type === 'PERCENTAGE' ? '%' : ''
    return `${pct}${type}`
  }

  /** 格式化持续时间 */
  private formatDuration(duration: number | undefined): string | undefined {
    if (duration == null) return undefined
    if (duration === -1) return '永久'
    if (duration <= 0) return undefined
    return `${duration}回合`
  }

  /**
   * 构建反向索引：遍历所有 SkillConfig，收集 steps 中引用的 buffId/effectId
   */
  private ensureIndex(): void {
    if (this.buffToSkillIndex !== null) return
    this.buffToSkillIndex = new Map()

    const allConfigs = this.skillManager.getSkillConfigs()
    for (const [skillId, config] of allConfigs) {
      if (!config.steps) continue
      for (const step of config.steps) {
        const refId = step.buffId ?? step.effectId
        if (!refId) continue
        if (!this.buffToSkillIndex.has(refId)) {
          this.buffToSkillIndex.set(refId, [])
        }
        this.buffToSkillIndex.get(refId)!.push(config)
      }
    }
  }

  /** 获取引用此 buffId 的技能列表 */
  private getBuffSourceSkills(buffId: string): SkillConfig[] {
    this.ensureIndex()
    return this.buffToSkillIndex?.get(buffId) ?? []
  }
}
