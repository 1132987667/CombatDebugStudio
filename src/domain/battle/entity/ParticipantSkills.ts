/**
 * 文件: ParticipantSkills.ts
 * 功能: 战斗参与者技能管理
 * 从 BattleParticipantImpl.ts 提取，职责单一
 */

import type { SkillConfig, SkillSet } from '@/domain/skill/types'
import { SkillType } from '@/domain/skill/types'
import { SkillBlockReason, type SkillAvailability } from '@/domain/battle/type/types'
import type { BuffQuery } from '@/domain/buff/types'
/**
 * 技能管理类
 * 管理参与者的技能配置和冷却状态
 */
export class ParticipantSkills {
  private skills: SkillSet
  private skillCooldowns: Map<string, number>

  constructor(skills: SkillSet, skillCooldowns?: Map<string, number>) {
    this.skills = skills
    this.skillCooldowns = skillCooldowns ?? new Map<string, number>()
  }

  /**
   * 获取所有技能配置
   */
  getSkills(): SkillSet {
    return this.skills
  }

  /**
   * 获取技能配置列表
   */
  getSkillList(): SkillConfig[] {
    return [
      ...(this.skills[SkillType.SMALL] || []),
      ...(this.skills[SkillType.PASSIVE] || []),
      ...(this.skills[SkillType.ULTIMATE] || []),
    ]
  }

  /**
   * 获取技能ID
   */
  getSkillIds(filter: 'active' | 'all' | 'passive' = SkillType.ALL as 'all'): string[] {
    const allSkills: string[] = []
    const activeSkills: string[] = []
    const passiveSkills: string[] = []

    if (this.skills[SkillType.SMALL]) {
      const smallIds = this.skills[SkillType.SMALL].map((skill) => skill.id)
      allSkills.push(...smallIds)
      activeSkills.push(...smallIds)
    }
    if (this.skills[SkillType.PASSIVE]) {
      const passiveIds = this.skills[SkillType.PASSIVE].map((skill) => skill.id)
      allSkills.push(...passiveIds)
      passiveSkills.push(...passiveIds)
    }
    if (this.skills[SkillType.ULTIMATE]) {
      const ultimateIds = this.skills[SkillType.ULTIMATE].map((skill) => skill.id)  
      allSkills.push(...ultimateIds)
      activeSkills.push(...ultimateIds)
    }

    switch (filter) {
      case 'active':
        return activeSkills
      case SkillType.PASSIVE:
        return passiveSkills
      default:
        return allSkills
    }
  }

  /**
   * 判断是否拥有指定技能
   */
  hasSkill(skillId: string): boolean {
    return this.getSkillIds().includes(skillId)
  }

  /**
   * 检查技能是否可用（未冷却）
   */
  isSkillAvailable(skillId: string): boolean {
    const cooldown = this.skillCooldowns.get(skillId)
    return cooldown === undefined || cooldown <= 0
  }

  /**
   * 统一技能可执行性检查
   * 合并能量、冷却、控制状态检查，通过 BuffQuery 解耦 BuffSystem
   * ponytail: 不检查目标有效性——目标由执行阶段的 resolveSkillTargets 处理
   */
  canExecuteSkill(
    characterId: string,
    skillId: string,
    currentEnergy: number,
    buffQuery: BuffQuery,
  ): SkillAvailability {
    // 1. 控制状态检查（通过 BuffQuery 接口解耦）
    if (buffQuery.isCharacterControlled(characterId)) {
      return { can: false, reason: SkillBlockReason.CONTROLLED }
    }
    if (!buffQuery.canUseSkill(characterId)) {
      return { can: false, reason: SkillBlockReason.SILENCED }
    }

    // 2. 冷却检查
    const cooldown = this.skillCooldowns.get(skillId) || 0
    if (cooldown > 0) {
      return { can: false, reason: SkillBlockReason.COOLDOWN }
    }

    // 3. 能量检查
    const skills = this.getSkillList()
    const skillConfig = skills.find(s => s.id === skillId)
    if (skillConfig && skillConfig.energyCost > 0 && currentEnergy < skillConfig.energyCost) {
      return { can: false, reason: SkillBlockReason.ENERGY_SHORT }
    }

    return { can: true, reason: SkillBlockReason.NONE }
  }

  /**
   * 设置技能冷却
   */
  setSkillCooldown(skillId: string, cooldown: number): void {
    if (cooldown > 0) {
      this.skillCooldowns.set(skillId, cooldown)
    } else {
      this.skillCooldowns.delete(skillId)
    }
  }

  /**
   * 减少所有技能的冷却回合数
   */
  reduceSkillCooldowns(): void {
    for (const [skillId, cooldown] of this.skillCooldowns.entries()) {
      const newCooldown = cooldown - 1
      if (newCooldown <= 0) {
        this.skillCooldowns.delete(skillId)
      } else {
        this.skillCooldowns.set(skillId, newCooldown)
      }
    }
  }

  /**
   * 获取技能剩余冷却回合数
   */
  getSkillCooldown(skillId: string): number {
    return this.skillCooldowns.get(skillId) || 0
  }

  /**
   * 重置所有技能冷却
   */
  resetSkillCooldowns(): void {
    this.skillCooldowns.clear()
  }

  /**
   * 导出冷却快照（普通对象）
   */
  exportCooldownSnapshot(): Record<string, number> {
    const snapshot: Record<string, number> = {}
    this.skillCooldowns.forEach((value, key) => {
      snapshot[key] = value
    })
    return snapshot
  }
}
