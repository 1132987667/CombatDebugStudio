import { LegacyHealCalculatorAdapter } from './src/framework/adapters/LegacyAdapters.js'

// 创建一个简单的MockParticipant
class MockParticipant {
  constructor(data) {
    this.id = data.id
    this.name = data.name
    this.level = data.level
    this.currentHealth = data.currentHealth
    this.maxHealth = data.maxHealth
    this.buffs = data.buffs || []
  }

  getAttribute(attribute) {
    switch (attribute) {
      case 'HP': return this.currentHealth
      case 'MAX_HP': return this.maxHealth
      case 'ATK': return this.level * 5
      case 'DEF': return this.level * 2
      case 'MDEF': return this.level * 1
      case 'SPD': return this.level * 3
      case 'strength': return this.level * 4
      case 'magicPower': return this.level * 3
      case 'wisdom': return this.level * 2
      default: return 0
    }
  }

  getAttributeValue(attribute) {
    return this.getAttribute(attribute)
  }
}

// 创建计算器和参与者
const healCalculator = new LegacyHealCalculatorAdapter()
const source = new MockParticipant({
  id: 'source_1',
  name: '测试源角色',
  level: 10,
  currentHealth: 100,
  maxHealth: 100
})

const target = new MockParticipant({
  id: 'target_1',
  name: '测试目标角色',
  level: 8,
  currentHealth: 80,
  maxHealth: 100
})

// 测试步骤
const step = {
  id: 'heal_step_2',
  type: 'HEAL',
  target: 'ally',
  scope: 'single',
  calculation: {
    baseValue: 25,
    extraValues: [
      { attribute: 'wisdom', ratio: 0.8 },
      { attribute: 'magicPower', ratio: 0.4 }
    ],
    isSingleTurn: false
  }
}

console.log('开始测试治疗计算...')

try {
  const heal = healCalculator.calculateHeal(step, source, target)
  console.log('治疗计算结果:', heal)
} catch (error) {
  console.error('治疗计算错误:', error)
}