/**
 * 鏂囦欢: BattleAI.ts
 * 鍔熻兘: 鎴樻枟AI鎺ュ彛鍜屽疄鐜? */

import type {
  BattleEntity,
  BattleAction,
  BattleState,
  ParticipantSide,
} from '@/domain/battle/types'
import {
  PARTICIPANT_SIDE,
  BATTLE_CONSTANTS,
  SKILL_EFFECT_CONSTANTS,
  ActionTypes,
} from '@/domain/battle/types'
import { EFFECT_TYPES } from '@/shared/types/effect'
import { useBattleStore } from '@/presentation/stores/battleStore'
import { battleLogManager } from '@/infrastructure/adapters/logging'
import type { BuffSystem } from '@/domain/buff/BuffSystem'
import type { SkillManager } from '@/domain/skill/SkillManager'
import {
  AIPriorityStrategy,
  AIPriorityStrategyFactory,
} from '@/domain/battle/ai/AIPriorityStrategy'
import {
  SkillConfig,
  SkillSet,
  ExtendedSkillStep,
  Skill,
  SkillType,
  convertSkillConfigToSkill,
} from '@/domain/skill/types'

/** 鎴樻枟AI鎺ュ彛 */
export interface BattleAI {
  /** 璁剧疆涓婁笅鏂囷紙Buff绯荤粺銆佹妧鑳界鐞嗗櫒锛?*/
  setContext(buffSystem: BuffSystem, skillManager: SkillManager): void

  /** 鍋氬嚭鎴樻枟鍐崇瓥 */
  makeDecision(
    battleState: BattleState,
    participant: BattleEntity,
  ): BattleAction

  /** 閫夋嫨鏀诲嚮鐩爣 */
  selectTarget(battleState: BattleState, participant: BattleEntity): string

  /** 鍒ゆ柇鏄惁搴旇浣跨敤鎶€鑳?*/
  shouldUseSkill(participant: BattleEntity): boolean

  /** 閫夋嫨瑕佷娇鐢ㄧ殑鎶€鑳?*/
  selectSkill(participant: BattleEntity): string | null

  /** 閫夋嫨鏅€氭敾鍑?*/
  selectAttack(participant: BattleEntity): BattleAction
}

/** 鎶€鑳介厤缃姞杞藉櫒绫诲瀷 */
export type SkillConfigLoader = (skillIds: string[]) => Skill[]

/** 鎴樺満鍒嗘瀽缁撴灉鎺ュ彛 */
interface BattleAnalysis {
  allies: BattleEntity[]
  enemies: BattleEntity[]
  teamHealthPercent: number
  highestThreatEnemy: { enemy: BattleEntity | null; threat: number }
  needsHealing: boolean
  shouldUseSkill: boolean
}

/** 鍩虹AI绛栫暐绫?*/
export class BaseBattleAI implements BattleAI {
  protected skills: Map<string, Skill> = new Map()
  protected skillConfigLoader?: SkillConfigLoader
  protected buffSystem?: BuffSystem
  protected skillManager?: SkillManager
  protected priorityStrategy: AIPriorityStrategy

  constructor(skillIds?: string[], strategyName: string = 'balanced') {
    this.priorityStrategy =
      AIPriorityStrategyFactory.createStrategy(strategyName)

    if (skillIds && skillIds.length > 0) {
      this.loadSkillsFromConfig(skillIds)
    } else {
      this.initializeSkills()
    }
  }

  /** 璁剧疆浼樺厛绾х瓥鐣?*/
  public setPriorityStrategy(strategyName: string): void {
    this.priorityStrategy =
      AIPriorityStrategyFactory.createStrategy(strategyName)
  }

  /** 鑾峰彇褰撳墠浼樺厛绾х瓥鐣?*/
  public getPriorityStrategy(): AIPriorityStrategy {
    return this.priorityStrategy
  }

  /** 浠庡閮ㄩ厤缃姞杞芥妧鑳?*/
  protected loadSkillsFromConfig(skillIds: string[]): void {
    if (this.skillConfigLoader) {
      const loadedSkills = this.skillConfigLoader(skillIds)
      loadedSkills.forEach((skill: any) => {
        if (skill && skill.id) {
          this.skills.set(skill.id, skill)
        }
      })
    }
  }

  /** 璁剧疆鎶€鑳介厤缃姞杞藉櫒 */
  public setSkillConfigLoader(loader: SkillConfigLoader): void {
    this.skillConfigLoader = loader
  }

  /** 鍒濆鍖栨妧鑳斤紙瀛愮被鍙噸鍐欙級 */
  protected initializeSkills(): void {}

  /** 鍋氬嚭鎴樻枟鍐崇瓥 */
  public makeDecision(
    battleState: BattleState,
    participant: BattleEntity,
  ): BattleAction {
    const battleStore = useBattleStore()
    try {
      if (!battleState || !participant) {
        battleLogManager.addDebugLog('AI鍐崇瓥鍙傛暟鏃犳晥')
        return this.selectAttack(participant)
      }

      const battleAnalysis = this.analyzeBattleState(battleState, participant)
      if (battleAnalysis.shouldUseSkill) {
        const skillId = this.selectSkill(
          participant,
          battleState,
          battleAnalysis,
        )
        console.log(`${participant.name} chose skill`, skillId)
        if (skillId) {
          try {
            return this.createSkillStep(battleState, participant, skillId)
          } catch (skillError) {
            battleLogManager.addDebugLog('Skill execution error')
            return this.selectAttack(participant)
          }
        }
      }

      return this.selectAttack(participant)
    } catch (error) {
      battleLogManager.addDebugLog('AI鍐崇瓥鍑洪敊')
      console.log('AI鍐崇瓥鍑洪敊')
      try {
        return this.selectAttack(participant)
      } catch (attackError) {
        battleLogManager.addDebugLog('鏀诲嚮鎵ц鍑洪敊')
      }
    }

    return this.selectAttack(participant)
  }

  /** 鍒嗘瀽鎴樺満鐘舵€?*/
  protected analyzeBattleState(
    battleState: BattleState,
    participant: BattleEntity,
  ): BattleAnalysis {
    const allies = this.getAliveParticipants(battleState, participant.type)
    const enemies = this.getAliveParticipants(
      battleState,
      participant.type === PARTICIPANT_SIDE.ALLY
        ? PARTICIPANT_SIDE.ENEMY
        : PARTICIPANT_SIDE.ALLY,
    )

    const teamHealth = allies.reduce((sum, p) => sum + p.currentHealth, 0)
    const teamMaxHealth = allies.reduce((sum, p) => sum + p.maxHealth, 0)
    const teamHealthPercent =
      teamMaxHealth > 0 ? teamHealth / teamMaxHealth : 0

    // 鍒ゆ柇鏄惁搴旇浣跨敤鎶€鑳斤細鏈夊彲鐢ㄦ妧鑳戒笖锛堣兘閲忓厖瓒虫垨鏈夋不鐤楅渶姹傦級
    const shouldUseSkill = this.shouldUseSkill(participant)

    return {
      allies,
      enemies,
      teamHealthPercent,
      highestThreatEnemy: { enemy: null, threat: 0 },
      needsHealing: teamHealthPercent < 0.5,
      shouldUseSkill,
    }
  }

  /** 鑾峰彇娲荤潃鐨勫弬涓庤€?*/
  private getAliveParticipants(
    battleState: BattleState,
    type: ParticipantSide,
  ): BattleEntity[] {
    return Array.from(battleState.participants.values()).filter(
      (p) => p.type === type && p.isAlive(),
    )
  }

  /** 閫夋嫨鏀诲嚮鐩爣 */
  public selectTarget(
    battleState: BattleState,
    participant: BattleEntity,
  ): string {
    const enemies = Array.from(battleState.participants.values()).filter(
      (p) => p.type !== participant.type && p.isAlive(),
    )

    if (enemies.length === 0) return ''

    // 閫夋嫨琛€閲忔渶浣庣殑鏁屼汉
    const target = enemies.reduce((min, p) =>
      p.currentHealth < min.currentHealth ? p : min,
    )

    return target.id
  }

  /** 鍒ゆ柇鏄惁搴旇浣跨敤鎶€鑳?*/
  public shouldUseSkill(participant: BattleEntity): boolean {
    if (this.skills.size === 0) return false

    // Check if any skill is available and has enough energy
    for (const skillId of this.skills.keys()) {
      if (participant.isSkillAvailable(skillId)) {
        // Check if energy is sufficient
        const skill = this.skills.get(skillId)
        if (skill && skill.energyCost !== undefined) {
          if (participant.currentEnergy >= skill.energyCost) {
            return true
          }
        } else {
          return true
        }
      }
    }

    return false
  }

  /** 閫夋嫨瑕佷娇鐢ㄧ殑鎶€鑳?*/
  public selectSkill(
    participant: BattleEntity,
    battleState?: BattleState,
    battleAnalysis?: BattleAnalysis,
  ): string | null {
    const availableSkills: Skill[] = []

    this.skills.forEach((skill) => {
      if (
        participant.isSkillAvailable(skill.id) &&
        this.canUseSkill(skill, participant)
      ) {
        availableSkills.push(skill)
      }
    })

    if (availableSkills.length === 0) return null

    // Use priority strategy to select skill
    if (battleState && battleAnalysis) {
      const weights = this.priorityStrategy.calculateSkillWeights(
        battleState,
        participant,
        availableSkills,
      )
      if (weights.length > 0) {
        return weights[0].skillId
      }
    }

    // Fallback: select first available skill
    return availableSkills[0].id
  }

  /** 妫€鏌ユ槸鍚﹁兘浣跨敤鎶€鑳?*/
  private canUseSkill(skill: Skill, participant: BattleEntity): boolean {
    if (skill.energyCost && participant.currentEnergy < skill.energyCost) {
      return false
    }
    return true
  }

  /** Create skill action */
  protected createSkillStep(
    battleState: BattleState,
    participant: BattleEntity,
    skillId: string,
  ): BattleAction {
    const targetId = this.selectTarget(battleState, participant)
    const skill = this.skills.get(skillId)

    return {
      id: `skill_${Date.now()}`,
      type: ActionTypes.SKILL,
      sourceId: participant.id,
      targetId,
      skillId,
      damage: skill?.damage || 0,
      heal: skill?.heal || 0,
      success: true,
      timestamp: Date.now(),
      turn: 0,
      effects: [
        {
          type: EFFECT_TYPES.SKILL,
          description: `${participant.name} uses skill`,
        },
      ],
    }
  }

  /** Select normal attack */
  public selectAttack(participant: BattleEntity): BattleAction {
    return {
      id: `attack_${Date.now()}`,
      type: ActionTypes.ATTACK,
      sourceId: participant.id,
      targetId: '',
      damage: participant.getRandomAttack(),
      success: true,
      timestamp: Date.now(),
      turn: 0,
      effects: [
        {
          type: EFFECT_TYPES.DAMAGE,
          value: participant.getRandomAttack(),
          description: `${participant.name} normal attack`,
        },
      ],
    }
  }

  /** 璁剧疆涓婁笅鏂?*/
  public setContext(
    buffSystem: BuffSystem,
    skillManager: SkillManager,
  ): void {
    this.buffSystem = buffSystem
    this.skillManager = skillManager
  }
}

/** AI宸ュ巶绫?*/
export class BattleAIFactory {
  /** 浣跨敤鎶€鑳藉垱寤篈I */
  static createAIWithSkills(
    side: ParticipantSide,
    skills: SkillConfig[],
  ): BattleAI {
    const ai = new BaseBattleAI()
    skills.forEach((skillConfig) => {
      const skill = convertSkillConfigToSkill(skillConfig)
      if (skill) {
        ai['skills'].set(skill.id, skill)
      }
    })
    return ai
  }
}
