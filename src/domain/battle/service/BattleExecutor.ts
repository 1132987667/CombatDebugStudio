/**
 * 文件: BattleExecutor.ts
 * 功能: 战斗执行引擎 — 负责参与者行动、技能执行、攻击处理等运行时逻辑
 * 从 BattleSystem.ts 提取，职责单一
 */

import type { BattleAction, BattleData, BattleEntity } from '@/domain/battle/types'
import { BattleActionHelper, BATTLE_CONSTANTS, PARTICIPANT_SIDE } from '@/domain/battle/types'
import type { SkillConfig, ExtendedSkillStep } from '@/domain/skill/types'
import type { SkillManager } from '@/domain/skill/SkillManager'
import type { DamageCalculator } from '@/domain/skill/DamageCalculator'
import type { PassiveSkillManager, PassiveSkillTrigger } from '@/domain/skill/PassiveSkillManager'
import type { BattleRecorder } from '@/domain/battle/service/BattleRecorder'
import type { BattleAnimationManager } from '@/domain/battle/BattleAnimationManager'
import { EFFECT_TYPES } from '@/shared/types/effect'
import { BUFF_ID as STUN_BUFF_ID } from '@/domain/buff/scripts/combat/StunDebuff'
import { newLogSegment, LogLevel, BATTLE_LOG_CATEGORIES } from '@/shared/types/battle-log'
import { battleLogManager } from '@/infrastructure/adapters/logging'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'

/**
 * 战斗执行器
 * 封装参与者的行动决策、技能/攻击执行、伤害/治疗应用、日志记录等运行时逻辑。
 */
export class BattleExecutor {
  constructor(
    private readonly skillManager: SkillManager,
    private readonly damageCalculator: DamageCalculator,
    private readonly passiveSkillManager: PassiveSkillManager,
    private readonly battleRecorder: BattleRecorder,
    private readonly animationManager: BattleAnimationManager,
  ) {}

  // ============ 参与者行动 ============

  /**
   * 检查参与者是否有控制类Buff
   */
  isParticipantControlled(participant: BattleEntity): boolean {
    if (participant.hasBuff(STUN_BUFF_ID)) return true
    if (participant.hasBuff('buff_silence')) return true
    return false
  }

  /**
   * 执行单个参与者的行动
   */
  async executeParticipantAction(
    battle: BattleData,
    participant: BattleEntity,
  ): Promise<void> {
    if (this.isParticipantControlled(participant)) {
      const action = BattleActionHelper.createStatus({
        sourceId: participant.id,
        targetId: participant.id,
        turn: battle.currentRound || 1,
        effects: [{
          type: 'status',
          description: `${participant.name} 被控制，无法行动`,
          duration: 0,
        }],
      })
      this.recordBattleAction(battle, action)
      battleLogManager.addBattleLog({
        turn: battle.currentRound || 1,
        message: `${participant.name} 被控制，无法行动`,
        segments: [{ text: `${participant.name} 被控制，无法行动` }],
        category: BATTLE_LOG_CATEGORIES.STATUS,
      })
      battleLogManager.addDebugLog(`角色[${participant.name}]被控制，无法行动`)
      return
    }

    const activeSkillIds = participant.getSkillIds('active')
    const availableSkills = activeSkillIds.filter((skillId) => {
      const energyCost = this.getSkillEnergyCost(skillId)
      if (participant.currentEnergy < energyCost) return false
      if (
        'isSkillAvailable' in participant &&
        typeof participant.isSkillAvailable === 'function'
      ) {
        if (!participant.isSkillAvailable(skillId)) return false
      }
      return true
    })

    const aiInstance = battle.aiInstances?.get(participant.id)
    if (aiInstance) {
      const action = aiInstance.makeDecision(
        this.convertToBattleState(battle),
        participant,
      )
      if (action.type === 'skill' && action.skillId) {
        const skill = this.skillManager.getSkillConfig(action.skillId)
        if (skill && activeSkillIds.includes(action.skillId)) {
          await this.selectAndExecuteSkill(battle, participant, skill)
        } else {
          await this.selectAndExecuteAttack(battle, participant)
        }
      } else {
        await this.selectAndExecuteAttack(battle, participant)
      }
    } else if (
      availableSkills.length > 0 &&
      Math.random() < BATTLE_CONSTANTS.SKILL_USE_CHANCE &&
      availableSkills[0]
    ) {
      const selectedSkillId =
        availableSkills[Math.floor(Math.random() * availableSkills.length)]
      const skill = this.skillManager.getSkillConfig(selectedSkillId)
      if (skill) {
        await this.selectAndExecuteSkill(battle, participant, skill)
      } else {
        await this.selectAndExecuteAttack(battle, participant)
      }
    } else {
      await this.selectAndExecuteAttack(battle, participant)
    }

    participant.afterAction()
  }

  // ============ 技能执行 ============

  /**
   * 选择并执行技能
   */
  async selectAndExecuteSkill(
    battle: BattleData,
    source: BattleEntity,
    skill: SkillConfig,
  ): Promise<BattleAction> {
    if (
      'isSkillAvailable' in source &&
      typeof source.isSkillAvailable === 'function'
    ) {
      if (!source.isSkillAvailable(skill.id)) {
        return this.selectAndExecuteAttack(battle, source)
      }
    }

    const energyCost = skill.energyCost ?? 0
    source.spendEnergy(energyCost)

    const action = BattleActionHelper.createSkill({
      sourceId: source.id,
      targetId: '',
      skillId: skill.id,
      skillName: skill.name,
      turn: battle.currentRound || 1,
    })

    const targets = this.getSkillTargets(battle, source, skill)
    if (targets.length === 0) {
      battleLogManager.addDebugLog(`技能执行失败: 未找到有效目标 ${skill.id}`)
      return this.selectAndExecuteAttack(battle, source)
    }

    action.targetId = targets[0].id

    try {
      let totalDamage = 0
      let totalHeal = 0
      const allEffects: any[] = []

      for (const target of targets) {
        if (!target.isAlive()) continue
        const skillAction = this.skillManager.executeSkill(
          skill.id,
          source,
          target,
          undefined,
          Array.from(battle.participants.values()),
        )
        // ponytail: handle null from executeSkill (config not found / insufficient energy / no target)
        if (!skillAction) continue
        totalDamage += skillAction.damage
        totalHeal += skillAction.heal
        allEffects.push(...skillAction.effects)
      }

      action.damage = totalDamage
      action.heal = totalHeal
      action.effects = allEffects

      const targetNames = targets.map((t) => t.name).join(', ')
      battleLogManager.addBattleLog({
        turn: battle.currentTurn,
        message: `技能执行成功: ${skill.id}`,
        segments: [{ text: `${source.name} 对 ${targetNames} 使用 ${skill.name || skill.id}` }],
        category: BATTLE_LOG_CATEGORIES.ACTION,
      })
    } catch (error) {
      battleLogManager.addDebugLog(`技能执行失败: ${skill.id}`, error)
      action.type = 'attack'
      action.damage = Math.floor(Math.random() * 20) + 10
      action.effects = [{
        type: EFFECT_TYPES.DAMAGE,
        value: action.damage,
        description: `${source.name} 普通攻击 (技能执行失败)`,
      }]
    }

    this.recordBattleAction(battle, action)
    return action
  }

  /**
   * 获取技能的所有目标
   */
  getSkillTargets(
    battle: BattleData,
    source: BattleEntity,
    skill: SkillConfig,
  ): BattleEntity[] {
    const selector = skill.selector || 'single_enemy'
    const participants = Array.from(battle.participants.values())

    if (selector === 'self') return [source]

    if (selector === 'lowest_ally') {
      const allies = participants.filter(
        (p) => p.isAlive() && p.team === source.team && p.id !== source.id,
      )
      if (allies.length === 0) return [source]
      return [allies.reduce((min, p) =>
        (p.getAttribute(ATTRIBUTE_CODE.currentHealth) / p.getAttribute(ATTRIBUTE_CODE.maxHealth)) <
        (min.getAttribute(ATTRIBUTE_CODE.currentHealth) / min.getAttribute(ATTRIBUTE_CODE.maxHealth)) ? p : min,
      )]
    }

    if (selector === 'lowest_enemy') {
      const isEnemySide = source.team === PARTICIPANT_SIDE.ALLY
      const enemies = participants.filter(
        (p) => p.isAlive() &&
          p.team === (isEnemySide ? PARTICIPANT_SIDE.ENEMY : PARTICIPANT_SIDE.ALLY),
      )
      if (enemies.length === 0) return [source]
      return [enemies.reduce((min, p) =>
        (p.getAttribute(ATTRIBUTE_CODE.currentHealth) / p.getAttribute(ATTRIBUTE_CODE.maxHealth)) <
        (min.getAttribute(ATTRIBUTE_CODE.currentHealth) / min.getAttribute(ATTRIBUTE_CODE.maxHealth)) ? p : min,
      )]
    }

    const isEnemy = source.team === PARTICIPANT_SIDE.ALLY
    if (selector.includes('all_enemies')) {
      return participants.filter(
        (p) => p.isAlive() &&
          p.team === (isEnemy ? PARTICIPANT_SIDE.ENEMY : PARTICIPANT_SIDE.ALLY),
      )
    }
    if (selector.includes('all_allies')) {
      return participants.filter((p) => p.isAlive() && p.team === source.team)
    }

    const targetId = this.selectTargetForSkill(battle, source, skill)
    const target = battle.participants.get(targetId)
    return target ? [target] : []
  }

  /**
   * 根据技能配置选择目标
   */
  selectTargetForSkill(
    battle: BattleData,
    source: BattleEntity,
    skill: SkillConfig,
  ): string {
    const selector = skill.selector || 'single_enemy'
    const participants = Array.from(battle.participants.values())

    if (selector.includes('self')) return source.id

    const isEnemy = source.team === PARTICIPANT_SIDE.ALLY
    const targets = participants.filter(
      (p) => p.isAlive() &&
        p.team === (isEnemy ? PARTICIPANT_SIDE.ALLY : PARTICIPANT_SIDE.ENEMY),
    )
    if (targets.length === 0) return source.id

    if (skill.steps.some((step) => step.type === 'HEAL' || step.type === 'BUFF')) {
      const lowestHpTarget = targets.reduce((min, p) =>
        (p.getAttribute(ATTRIBUTE_CODE.currentHealth) / p.getAttribute(ATTRIBUTE_CODE.maxHealth)) <
        (min.getAttribute(ATTRIBUTE_CODE.currentHealth) / min.getAttribute(ATTRIBUTE_CODE.maxHealth)) ? p : min,
      )
      return lowestHpTarget.id
    } else {
      return targets[Math.floor(Math.random() * targets.length)].id
    }
  }

  // ============ 普通攻击 ============

  /**
   * 构造普通攻击的技能步骤配置
   */
  buildNormalAttackStep(source: BattleEntity, targetId: string): ExtendedSkillStep {
    return {
      type: 'DAMAGE',
      id: 'normal_attack',
      targetId,
      calculation: {
        baseValue: 0,
        extraValues: [{ attribute: 'ATK', ratio: 1.0 }],
      },
      attackType: 'physical',
      // ponytail: targetModifiers intentionally omitted — { DEF: 1 } inverted the
      // formula (higher DEF = more damage). Defense is already handled by the
      // separate defense-degression formula in DamageCalculator.
    }
  }

  /**
   * 创建战斗动作对象
   */
  createBattleAction(sourceId: string, targetId: string, turnNumber: number): BattleAction {
    return BattleActionHelper.createAttack({ sourceId, targetId, turn: turnNumber })
  }

  /**
   * 生成攻击日志参数
   */
  generateAttackLogParams(
    source: BattleEntity,
    target: BattleEntity,
    turnNumber: number,
    options: { isMiss?: boolean; damage?: number; isCritical?: boolean },
  ): {
    turn: number
    message: string
    segments: import('@/shared/types/battle-log').LogSegment[]
    category: import('@/shared/types/battle-log').BattleLogCategory
  } {
    const { isMiss = false, damage = 0, isCritical = false } = options

    if (isMiss) {
      return {
        turn: turnNumber,
        message: `${source.name} 对 ${target.name} 发动普通攻击，但是被闪避了！`,
        segments: [
          { text: source.name, classStr: 'log-hostile' },
          { text: ' 对 ' },
          { text: target.name, classStr: 'log-friendly' },
          { text: ' 发动普通攻击，但是被闪避了！' },
        ],
        category: BATTLE_LOG_CATEGORIES.STATUS,
      }
    }

    return {
      turn: turnNumber,
      message: `${source.name} 对 ${target.name} 发动普通攻击，${isCritical ? '暴击！' : ''}造成 ${damage} 点物理伤害`,
      segments: [
        { text: source.name, classStr: source.type === PARTICIPANT_SIDE.ALLY ? 'log-friendly' : 'log-hostile' },
        { text: ' 对 ' },
        { text: target.name, classStr: target.type === PARTICIPANT_SIDE.ALLY ? 'log-friendly' : 'log-hostile' },
        { text: ` 发动普通攻击，${isCritical ? '暴击！' : ''}造成 ` },
        { text: damage.toString(), classStr: isCritical ? 'log-crit' : 'log-damage' },
        { text: ' 点物理伤害' },
      ],
      category: isCritical ? BATTLE_LOG_CATEGORIES.CRIT : BATTLE_LOG_CATEGORIES.DAMAGE,
    }
  }

  /**
   * 对目标应用伤害并触发相关被动技能
   */
  applyDamageToTarget(source: BattleEntity, target: BattleEntity, damage: number): void {
    target.takeDamage(damage)
    this.passiveSkillManager.triggerPassiveSkills(
      'ON_HIT' as any, target, { sourceId: source.id, damage },
    )
    if (!target.isAlive()) {
      this.passiveSkillManager.triggerPassiveSkills(
        'ON_DEATH' as any, target, { sourceId: source.id, cause: 'damage' },
      )
    }
  }

  /**
   * 处理攻击被闪避的情况
   */
  async handleMissAttack(
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    turnNumber: number,
  ): Promise<void> {
    action.effects.push({
      type: EFFECT_TYPES.MISS,
      value: 0,
      description: `${target.name} 闪避了攻击`,
    })
    await this.animationManager.triggerMissAnimationAndWait({ targetId: target.id })

    const logParams = this.generateAttackLogParams(source, target, turnNumber, { isMiss: true })
    battleLogManager.addBattleLog({ turn: logParams.turn, message: logParams.message, segments: logParams.segments, category: logParams.category })
    battleLogManager.addDebugLog(`普通攻击: ${source.name} → ${target.name}，被闪避`)
  }

  /**
   * 处理攻击命中的情况
   */
  async handleHitAttack(
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    damageResult: { damage: number; isCritical: boolean },
    turnNumber: number,
  ): Promise<void> {
    const { damage, isCritical } = damageResult
    action.damage = damage

    this.applyDamageToTarget(source, target, damage)

    action.effects.push({
      type: EFFECT_TYPES.DAMAGE,
      value: damage,
      description: `${source.name} 普通攻击 造成 ${damage} 伤害${isCritical ? ' (暴击)' : ''}`,
    })

    await this.animationManager.triggerDamageAnimationAndWait({
      targetId: target.id, damage, damageType: 'physical', isCritical, isHeal: false,
    })

    const logParams = this.generateAttackLogParams(source, target, turnNumber, { damage, isCritical })
    battleLogManager.addBattleLog({ turn: logParams.turn, message: logParams.message, segments: logParams.segments, category: logParams.category })
    battleLogManager.addDebugLog(`普通攻击: ${source.name} → ${target.name}`)
  }

  /**
   * 选择并执行普通攻击
   */
  async selectAndExecuteAttack(
    battle: BattleData,
    source: BattleEntity,
  ): Promise<BattleAction> {
    const targetId = this.selectTarget(battle, source)
    const target = battle.participants.get(targetId)

    if (!target) {
      battleLogManager.addDebugLog(`攻击失败: 未找到目标 ${targetId}`)
      return this.createBattleAction(source.id, source.id, battle.currentRound || 1)
    }

    const roundNumber = battle.currentRound || 1

    this.passiveSkillManager.triggerPassiveSkills(
      'BEFORE_ATTACK' as any, source, { targetId, battle },
    )

    const attackStep = this.buildNormalAttackStep(source, targetId)
    const damageResult = this.damageCalculator.calculateDamage(attackStep, source, target)

    const action = this.createBattleAction(source.id, targetId, roundNumber)

    if (damageResult.isMiss) {
      await this.handleMissAttack(action, source, target, roundNumber)
    } else {
      await this.handleHitAttack(action, source, target, damageResult, roundNumber)
    }

    this.passiveSkillManager.triggerPassiveSkills(
      'AFTER_ATTACK' as any, source, {
        targetId, damage: action.damage, isCritical: damageResult.isCritical,
      },
    )

    this.recordBattleAction(battle, action)
    return action
  }

  /**
   * 选择攻击目标
   */
  selectTarget(battle: BattleData, source: BattleEntity): string {
    const enemies = Array.from(battle.participants.values()).filter(
      (p) => p.type !== source.type && p.isAlive(),
    )
    if (enemies.length === 0) return source.id
    return enemies[Math.floor(Math.random() * enemies.length)].id
  }

  // ============ 工具方法 ============

  /**
   * 获取技能能量消耗
   */
  getSkillEnergyCost(skillId: string): number {
    return this.skillManager.getSkillConfig(skillId)?.energyCost ?? 0
  }

  /**
   * 添加战斗动作到记录
   */
  addBattleAction(battle: BattleData, action: BattleAction): void {
    if (battle) {
      battle.actions.push(action)
      if (battle.actions.length > 100) {
        battle.actions = battle.actions.slice(-100)
      }
    }
  }

  /**
   * 记录战斗动作
   */
  recordBattleAction(battle: BattleData, action: BattleAction): void {
    this.addBattleAction(battle, action)
    this.battleRecorder.recordAction(battle.battleId, action, battle.currentRound || 1)
  }

  /**
   * 执行默认行动（当AI决策失败或无效时使用）
   */
  async executeDefaultAction(battle: BattleData, participant: BattleEntity): Promise<void> {
    const enemies = Array.from(battle.participants.values())
      .filter((p) => p.type === PARTICIPANT_SIDE.ENEMY && p.isAlive())
      .map((p) => p.id)
    const characters = Array.from(battle.participants.values())
      .filter((p) => p.type === PARTICIPANT_SIDE.ALLY && p.isAlive())
      .map((p) => p.id)

    let targetId: string
    let damage: number

    if (participant.type === PARTICIPANT_SIDE.ALLY && enemies.length > 0) {
      targetId = enemies[Math.floor(Math.random() * enemies.length)]
      damage = Math.floor(Math.random() * 20) + 10
    } else if (participant.type === PARTICIPANT_SIDE.ENEMY && characters.length > 0) {
      targetId = characters[Math.floor(Math.random() * characters.length)]
      damage = Math.floor(Math.random() * 15) + 8
    } else {
      return
    }

    await this.executeAction(battle, {
      id: `action_${Date.now()}`,
      type: 'attack',
      sourceId: participant.id,
      targetId,
      damage,
      success: true,
      timestamp: Date.now(),
      turn: battle.currentRound || 1,
      effects: [{
        type: EFFECT_TYPES.DAMAGE,
        value: damage,
        description: `${participant.name} 普通攻击 造成 ${damage} 伤害`,
      }],
    })
  }

  /**
   * 执行战斗动作
   */
  async executeAction(battle: BattleData, action: BattleAction): Promise<BattleAction> {
    const source = battle.participants.get(action.sourceId)
    const target = battle.participants.get(action.targetId)

    if (!source || !target) {
      throw new Error('Invalid source or target in action')
    }

    if (action.type === 'skill' && action.skillId) {
      try {
        const skillAction = this.skillManager.executeSkill(
          action.skillId, source, target, undefined,
          Array.from(battle.participants.values()),
        )
        if (!skillAction) {
          battleLogManager.addDebugLog(`技能执行返回空: ${action.skillId}`)
          action.damage = 0
          action.heal = 0
          action.effects = []
        } else {
          action.damage = skillAction.damage
          action.heal = skillAction.heal
          action.effects = skillAction.effects
        }

        const hasMissEffect = skillAction.effects.some(
          (effect) => effect.type === EFFECT_TYPES.MISS,
        )
        if (hasMissEffect) {
          await this.animationManager.triggerMissAnimationAndWait({ targetId: target.id })
        }

        for (const effect of skillAction.effects) {
          if (effect.type === EFFECT_TYPES.BUFF || effect.type === EFFECT_TYPES.DEBUFF) {
            let buffTarget = target
            if (effect.targetId === source.id) buffTarget = source
            await this.animationManager.triggerBuffEffectAndWait({
              targetId: buffTarget.id,
              buffName: effect.buffId || 'unknown',
              isPositive: effect.type === EFFECT_TYPES.BUFF,
            })
          }
        }

        await this.animationManager.triggerSkillEffectAnimation({
          sourceId: source.id, targetId: target.id, skillName: action.skillId,
          effectType: action.type, damageType: 'skill',
        })
      } catch (error) {
        battleLogManager.addDebugLog(`技能执行失败: ${action.skillId}`, error)
        action.type = 'attack'
        action.damage = Math.floor(Math.random() * 20) + 10
        action.effects = [{
          type: EFFECT_TYPES.DAMAGE,
          value: action.damage,
          description: `${source.name} 普通攻击 (技能执行失败)`,
        }]
      }
    }

    // ponytail: skill actions already apply damage+heal inside SkillExecutor,
    // so only apply raw damage/heal for non-skill actions (e.g. fallback attack).
    if (action.type !== 'skill') {
      if (action.damage && action.damage > 0) {
        const actualDamage = target.takeDamage(action.damage)
        action.damage = actualDamage

        this.passiveSkillManager.triggerPassiveSkills(
          'ON_HIT' as any, target, { sourceId: source.id, damage: actualDamage },
        )
        if (!target.isAlive()) {
          this.passiveSkillManager.triggerPassiveSkills(
            'ON_DEATH' as any, target, { sourceId: source.id, cause: 'damage' },
          )
        }

        await this.animationManager.triggerDamageAnimationAndWait({
          targetId: target.id, damage: actualDamage,
          damageType: 'physical',
          isCritical: false, isHeal: false,
        })
      }

      if (action.heal && action.heal > 0) {
        const actualHeal = target.heal(action.heal)
        action.heal = actualHeal

        await this.animationManager.triggerDamageAnimationAndWait({
          targetId: target.id, damage: actualHeal, damageType: 'heal',
          isCritical: false, isHeal: true,
        })
      }
    }

    this.recordBattleAction(battle, action)
    source.afterAction()
    return action
  }

  /**
   * 转换为战斗状态（用于AI决策）
   */
  private convertToBattleState(battle: BattleData): BattleState {
    return {
      participants: Array.from(battle.participants.values()),
      currentRound: battle.currentRound || 1,
      turnOrder: battle.turnOrder || [],
      currentTurn: battle.currentTurn || 0,
    } as any
  }
}

// 用于 AI 决策的简化类型
interface BattleState {
  participants: BattleEntity[]
  currentRound: number
  turnOrder: string[]
  currentTurn: number
}
