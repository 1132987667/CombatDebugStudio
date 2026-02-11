/**
 * 自动播放功能测试脚本
 * 用于验证自动战斗功能是否正常工作
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GameBattleSystem } from '../src/core/BattleSystem'
import type { ParticipantInfo } from '@/types/battle'
import { PARTICIPANT_SIDE } from '@/types/battle'

function createMockParticipantInfo(overrides: Partial<ParticipantInfo> = {}): ParticipantInfo {
  const baseInfo: ParticipantInfo = {
    id: overrides.id || 'default',
    name: overrides.name || '测试参与者',
    type: overrides.type || PARTICIPANT_SIDE.ALLY,
    maxHealth: overrides.maxHealth || 100,
    currentHealth: overrides.currentHealth || 100,
    maxEnergy: overrides.maxEnergy || 150,
    currentEnergy: overrides.currentEnergy || 25,
    level: overrides.level || 5,
    minAttack: overrides.minAttack || 15,
    maxAttack: overrides.maxAttack || 25,
    defense: overrides.defense || 10,
    speed: overrides.speed || 15,
    critRate: overrides.critRate || 10,
    critDamage: overrides.critDamage || 125,
    damageReduction: overrides.damageReduction || 0,
    healthBonus: overrides.healthBonus || 0,
    attackBonus: overrides.attackBonus || 0,
    defenseBonus: overrides.defenseBonus || 0,
    speedBonus: overrides.speedBonus || 0,
    buffs: overrides.buffs || [],
    skills: overrides.skills || { small: [], passive: [], ultimate: [] },
    getAttribute(attribute: string): number {
      switch (attribute) {
        case 'HP': return this.currentHealth
        case 'MAX_HP': return this.maxHealth
        case 'ATK': return this.minAttack + (this.maxAttack - this.minAttack) / 2
        case 'MIN_ATK': return this.minAttack
        case 'MAX_ATK': return this.maxAttack
        case 'DEF': return this.defense
        case 'SPD': return this.speed
        case 'CRIT_RATE': return this.critRate
        case 'CRIT_DMG': return this.critDamage
        case 'DMG_RED': return this.damageReduction
        case 'energy': return this.currentEnergy
        case 'max_energy': return this.maxEnergy
        default: return 0
      }
    },
    setAttribute(attribute: string, value: number): void {
      if (attribute === 'HP') {
        this.currentHealth = Math.max(0, Math.min(value, this.maxHealth))
      } else if (attribute === 'energy') {
        this.currentEnergy = Math.max(0, Math.min(value, this.maxEnergy))
      }
    },
    addBuff(buffInstanceId: string): void {
      if (!this.buffs.includes(buffInstanceId)) {
        this.buffs.push(buffInstanceId)
      }
    },
    removeBuff(buffInstanceId: string): void {
      this.buffs = this.buffs.filter(id => id !== buffInstanceId)
    },
    hasBuff(buffId: string): boolean {
      return this.buffs.some(id => id.includes(buffId))
    },
    takeDamage(amount: number): number {
      const damage = Math.max(0, amount)
      this.currentHealth = Math.max(0, this.currentHealth - damage)
      this.gainEnergy(15)
      return damage
    },
    heal(amount: number): number {
      const healAmount = Math.max(0, amount)
      const originalHealth = this.currentHealth
      this.currentHealth = Math.min(this.currentHealth + healAmount, this.maxHealth)
      return this.currentHealth - originalHealth
    },
    isAlive(): boolean {
      return this.currentHealth > 0
    },
    gainEnergy(amount: number): void {
      this.currentEnergy = Math.min(this.currentEnergy + amount, this.maxEnergy)
    },
    spendEnergy(amount: number): boolean {
      if (this.currentEnergy >= amount) {
        this.currentEnergy -= amount
        return true
      }
      return false
    },
    afterAction(): void {
      this.gainEnergy(10)
    },
    isFullHealth(): boolean {
      return this.currentHealth >= this.maxHealth
    },
    needsHealing(): boolean {
      return this.currentHealth / this.maxHealth < 0.5
    },
    getSkills(): any[] {
      const allSkills: any[] = []
      if (this.skills.small) allSkills.push(...this.skills.small)
      if (this.skills.passive) allSkills.push(...this.skills.passive)
      if (this.skills.ultimate) allSkills.push(...this.skills.ultimate)
      return allSkills
    },
    hasSkill(skillId: string): boolean {
      return this.getSkills().includes(skillId)
    },
  }
  return { ...baseInfo, ...overrides }
}

describe('自动播放功能测试', () => {
  let battleSystem: GameBattleSystem
  let mockParticipants: ParticipantInfo[]

  beforeEach(() => {
    battleSystem = GameBattleSystem.getInstance()
    mockParticipants = [
      createMockParticipantInfo({
        id: 'char1',
        name: '测试角色',
        type: PARTICIPANT_SIDE.ALLY,
        maxHealth: 100,
        currentHealth: 100,
        maxEnergy: 150,
        currentEnergy: 25,
        level: 5,
        minAttack: 15,
        maxAttack: 25,
        defense: 10,
        speed: 15,
        critRate: 10,
        critDamage: 125,
        damageReduction: 0,
        healthBonus: 0,
        attackBonus: 0,
        defenseBonus: 0,
        speedBonus: 0,
        buffs: [],
        skills: { small: [], passive: [], ultimate: [] },
      }),
      createMockParticipantInfo({
        id: 'enemy1',
        name: '测试敌人',
        type: PARTICIPANT_SIDE.ENEMY,
        maxHealth: 80,
        currentHealth: 80,
        maxEnergy: 150,
        currentEnergy: 25,
        level: 5,
        minAttack: 12,
        maxAttack: 24,
        defense: 8,
        speed: 12,
        critRate: 10,
        critDamage: 125,
        damageReduction: 0,
        healthBonus: 0,
        attackBonus: 0,
        defenseBonus: 0,
        speedBonus: 0,
        buffs: [],
        skills: { small: [], passive: [], ultimate: [] },
      }),
    ]
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  describe('startAutoBattle', () => {
    it('应该成功开始自动战斗', () => {
      const battleState = battleSystem.createBattle(mockParticipants)

      battleSystem.startAutoBattle(battleState.battleId, 1)

      expect(battleSystem.isAutoBattleActive(battleState.battleId)).toBe(true)
    })

    it('应该拒绝不存在的战斗ID', () => {
      const consoleSpy = vi.spyOn(console, 'warn')

      battleSystem.startAutoBattle('non-existent-battle', 1)

      expect(consoleSpy).toHaveBeenCalled()
      expect(battleSystem.isAutoBattleActive('non-existent-battle')).toBe(false)
    })

    it('应该拒绝已开始的自动战斗', () => {
      const battleState = battleSystem.createBattle(mockParticipants)
      const consoleSpy = vi.spyOn(console, 'warn')

      battleSystem.startAutoBattle(battleState.battleId, 1)
      battleSystem.startAutoBattle(battleState.battleId, 2)

      expect(consoleSpy).toHaveBeenCalled()
    })

    it('应该能够重新启动已停止的自动战斗', () => {
      const battleState = battleSystem.createBattle(mockParticipants)

      battleSystem.startAutoBattle(battleState.battleId, 1)
      battleSystem.stopAutoBattle(battleState.battleId)
      battleSystem.startAutoBattle(battleState.battleId, 2)

      expect(battleSystem.isAutoBattleActive(battleState.battleId)).toBe(true)
    })
  })

  describe('stopAutoBattle', () => {
    it('应该成功停止自动战斗', () => {
      const battleState = battleSystem.createBattle(mockParticipants)

      battleSystem.startAutoBattle(battleState.battleId, 1)
      battleSystem.stopAutoBattle(battleState.battleId)

      expect(battleSystem.isAutoBattleActive(battleState.battleId)).toBe(false)
    })

    it('应该能够停止不存在的战斗而不报错', () => {
      expect(() => {
        battleSystem.stopAutoBattle('non-existent-battle')
      }).not.toThrow()
    })

    it('应该能够停止已停止的战斗而不报错', () => {
      const battleState = battleSystem.createBattle(mockParticipants)

      battleSystem.startAutoBattle(battleState.battleId, 1)
      battleSystem.stopAutoBattle(battleState.battleId)
      battleSystem.stopAutoBattle(battleState.battleId)

      expect(battleSystem.isAutoBattleActive(battleState.battleId)).toBe(false)
    })
  })

  describe('isAutoBattleActive', () => {
    it('应该正确返回自动战斗状态', () => {
      const battleState = battleSystem.createBattle(mockParticipants)

      expect(battleSystem.isAutoBattleActive(battleState.battleId)).toBe(false)

      battleSystem.startAutoBattle(battleState.battleId, 1)
      expect(battleSystem.isAutoBattleActive(battleState.battleId)).toBe(true)

      battleSystem.stopAutoBattle(battleState.battleId)
      expect(battleSystem.isAutoBattleActive(battleState.battleId)).toBe(false)
    })

    it('应该对不存在的战斗返回false', () => {
      expect(battleSystem.isAutoBattleActive('non-existent-battle')).toBe(false)
    })
  })

  describe('setBattleSpeed', () => {
    it('应该能够设置自动战斗速度', () => {
      const battleState = battleSystem.createBattle(mockParticipants)
      const consoleSpy = vi.spyOn(console, 'info')

      battleSystem.startAutoBattle(battleState.battleId, 1)
      battleSystem.setBattleSpeed(battleState.battleId, 2)

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('速度从 1x 更新为: 2x'),
      )
    })

    it('应该拒绝不存在的战斗ID', () => {
      const consoleSpy = vi.spyOn(console, 'warn')

      battleSystem.setBattleSpeed('non-existent-battle', 2)

      expect(consoleSpy).toHaveBeenCalled()
    })

    it('应该能够更新未开始战斗的速度', () => {
      const battleState = battleSystem.createBattle(mockParticipants)

      expect(() => {
        battleSystem.setBattleSpeed(battleState.battleId, 2)
      }).not.toThrow()
    })

    it('应该能够实时更新正在进行的战斗速度', () => {
      const battleState = battleSystem.createBattle(mockParticipants)

      battleSystem.startAutoBattle(battleState.battleId, 1)
      battleSystem.setBattleSpeed(battleState.battleId, 5)

      expect(battleSystem.isAutoBattleActive(battleState.battleId)).toBe(true)
    })
  })

  describe('自动战斗循环', () => {
    it('应该能够执行多个回合', async () => {
      vi.useFakeTimers()

      const battleState = battleSystem.createBattle(mockParticipants)
      const processTurnSpy = vi.spyOn(
        battleSystem as any,
        'processTurnInternal',
      )

      battleSystem.startAutoBattle(battleState.battleId, 1)

      vi.advanceTimersByTime(2000)

      expect(processTurnSpy).toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('应该在战斗结束时自动停止', async () => {
      vi.useFakeTimers()

      const battleState = battleSystem.createBattle(mockParticipants)

      battleSystem.startAutoBattle(battleState.battleId, 1)

      battleSystem.endBattle(battleState.battleId, PARTICIPANT_SIDE.ALLY)

      vi.advanceTimersByTime(1000)

      expect(battleSystem.isAutoBattleActive(battleState.battleId)).toBe(false)

      vi.useRealTimers()
    })

    it('应该能够处理错误并停止', async () => {
      vi.useFakeTimers()

      const battleState = battleSystem.createBattle(mockParticipants)
      const consoleSpy = vi.spyOn(console, 'error')

      vi.spyOn(battleSystem as any, 'processTurnInternal').mockRejectedValue(
        new Error('测试错误'),
      )

      battleSystem.startAutoBattle(battleState.battleId, 1)

      vi.advanceTimersByTime(1000)

      expect(consoleSpy).toHaveBeenCalled()
      expect(battleSystem.isAutoBattleActive(battleState.battleId)).toBe(false)

      vi.useRealTimers()
    })
  })

  describe('状态管理', () => {
    it('应该正确清理已停止的战斗状态', () => {
      const battleState = battleSystem.createBattle(mockParticipants)

      battleSystem.startAutoBattle(battleState.battleId, 1)
      battleSystem.stopAutoBattle(battleState.battleId)

      expect(battleSystem.isAutoBattleActive(battleState.battleId)).toBe(false)
    })

    it('应该能够同时管理多个战斗', () => {
      const battle1 = battleSystem.createBattle(mockParticipants)
      const battle2 = battleSystem.createBattle(mockParticipants)

      battleSystem.startAutoBattle(battle1.battleId, 1)
      battleSystem.startAutoBattle(battle2.battleId, 2)

      expect(battleSystem.isAutoBattleActive(battle1.battleId)).toBe(true)
      expect(battleSystem.isAutoBattleActive(battle2.battleId)).toBe(true)

      battleSystem.stopAutoBattle(battle1.battleId)

      expect(battleSystem.isAutoBattleActive(battle1.battleId)).toBe(false)
      expect(battleSystem.isAutoBattleActive(battle2.battleId)).toBe(true)
    })
  })
})
