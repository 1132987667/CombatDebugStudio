/**
 * 文件: autoTaskExample.ts
 * 创建日期: 2026-02-17
 * 作者: CombatDebugStudio
 * 功能: 自动任务执行示例
 * 描述: 展示如何使用TaskExecutor来运行长时间的自动战斗任务
 * 版本: 1.0.0
 */

import { taskExecutor } from '@/core/TaskExecutor'
import { GameBattleSystem } from '@/core/BattleSystem'
import { PARTICIPANT_SIDE } from '@/types/battle'

/**
 * 创建示例战斗
 * @returns 战斗ID
 */
function createExampleBattle() {
  const battleSystem = GameBattleSystem.getInstance()
  
  // 创建示例参与者
  const participants = [
    {
      id: 'char1',
      name: '测试角色1',
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
    },
    {
      id: 'enemy1',
      name: '测试敌人1',
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
    },
  ]

  // 创建战斗
  const battleState = battleSystem.createBattle(participants)
  return battleState.battleId
}

/**
 * 运行自动战斗任务示例
 */
async function runAutoBattleTaskExample() {
  console.log('=== 自动战斗任务示例 ===')

  // 创建示例战斗
  const battleId = createExampleBattle()
  console.log(`创建战斗成功，战斗ID: ${battleId}`)

  // 创建自动战斗任务
  const taskId = taskExecutor.createTask('自动战斗测试', 'auto_battle', {
    battleId,
    maxRounds: 50, // 最大50回合
    speed: 3, // 战斗速度级别3
  })

  console.log(`创建任务成功，任务ID: ${taskId}`)

  // 开始执行任务
  try {
    await taskExecutor.startTask(taskId)
    console.log(`任务开始执行: ${taskId}`)

    // 定期检查任务状态
    const statusInterval = setInterval(() => {
      const taskStatus = taskExecutor.getTaskStatus(taskId)
      if (taskStatus) {
        console.log(`任务状态: ${taskStatus.status}, 进度: ${taskStatus.progress.toFixed(1)}%`)

        // 任务完成或失败时停止检查
        if (['completed', 'failed', 'timeout'].includes(taskStatus.status)) {
          clearInterval(statusInterval)
          console.log('=== 任务执行完成 ===')
          console.log(`任务结果: ${taskStatus.status}`)
          if (taskStatus.result) {
            console.log(`战斗结果: ${taskStatus.result.winner}`)
            console.log(`战斗回合: ${taskStatus.result.rounds}`)
            console.log(`战斗时长: ${taskStatus.result.duration}ms`)
          }
          if (taskStatus.error) {
            console.error(`任务错误: ${taskStatus.error.message}`)
          }
        }
      }
    }, 2000)
  } catch (error) {
    console.error('任务执行失败:', error)
  }
}

/**
 * 运行多个自动战斗任务示例
 */
async function runMultipleTasksExample() {
  console.log('=== 多任务执行示例 ===')

  // 创建多个战斗和任务
  for (let i = 1; i <= 3; i++) {
    const battleId = createExampleBattle()
    const taskId = taskExecutor.createTask(`自动战斗测试 ${i}`, 'auto_battle', {
      battleId,
      maxRounds: 30,
      speed: 2,
    })

    console.log(`创建任务 ${i}: ${taskId}`)
    await taskExecutor.startTask(taskId)

    // 短暂延迟，避免同时创建多个战斗导致的问题
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  // 监控所有任务状态
  const statusInterval = setInterval(() => {
    const allTasks = taskExecutor.getAllTasks()
    const runningTasks = taskExecutor.getRunningTasks()

    console.log(`\n=== 任务状态监控 ===`)
    console.log(`总任务数: ${allTasks.length}`)
    console.log(`运行中任务数: ${runningTasks.length}`)

    allTasks.forEach(task => {
      console.log(`${task.name}: ${task.status}, 进度: ${task.progress.toFixed(1)}%`)
    })

    // 所有任务完成时停止检查
    if (runningTasks.length === 0) {
      clearInterval(statusInterval)
      console.log('\n=== 所有任务执行完成 ===')
    }
  }, 3000)
}

// 导出示例函数
export { runAutoBattleTaskExample, runMultipleTasksExample }