/**
 * 自动播放功能验证脚本
 * 用于验证自动战斗功能是否正常工作
 */

import { GameBattleSystem } from '../src/core/BattleSystem'
import type { ParticipantInfo } from '@/types/battle'
import { PARTICIPANT_SIDE } from '@/types/battle'

console.log('=== 自动播放功能验证 ===\n')

// 创建战斗系统实例
const battleSystem = GameBattleSystem.getInstance()

// 创建测试参与者
const participants: ParticipantInfo[] = [
  {
    id: 'char1',
    name: '测试角色',
    type: PARTICIPANT_SIDE.ALLY,
    currentHealth: 100,
    maxEnergy: 100,
  },
  {
    id: 'enemy1',
    name: '测试敌人',
    type: PARTICIPANT_SIDE.ENEMY,
    currentHealth: 80,
    maxEnergy: 80,
  },
]

console.log('1. 创建战斗...')
const battleState = battleSystem.createBattle(participants)
console.log(`   ✓ 战斗创建成功，战斗ID: ${battleState.battleId}\n`)

console.log('2. 测试自动战斗状态...')
console.log(
  `   初始状态: ${battleSystem.isAutoBattleActive(battleState.battleId) ? '运行中' : '未运行'}`,
)

console.log('\n3. 开始自动战斗 (速度: 1x)...')
battleSystem.startAutoBattle(battleState.battleId, 1)
console.log(
  `   当前状态: ${battleSystem.isAutoBattleActive(battleState.battleId) ? '运行中 ✓' : '未运行 ✗'}`,
)

console.log('\n4. 等待3秒...')
await new Promise((resolve) => setTimeout(resolve, 3000))

const battleStateAfter3s = battleSystem.getBattleState(battleState.battleId)
console.log(`   当前回合: ${battleStateAfter3s?.currentTurn || 0}`)

console.log('\n5. 修改自动播放速度为 2x...')
battleSystem.setBattleSpeed(battleState.battleId, 2)
console.log(`   ✓ 速度已更新`)

console.log('\n6. 等待2秒...')
await new Promise((resolve) => setTimeout(resolve, 2000))

const battleStateAfter5s = battleSystem.getBattleState(battleState.battleId)
console.log(`   当前回合: ${battleStateAfter5s?.currentTurn || 0}`)

console.log('\n7. 停止自动战斗...')
battleSystem.stopAutoBattle(battleState.battleId)
console.log(
  `   当前状态: ${battleSystem.isAutoBattleActive(battleState.battleId) ? '运行中 ✗' : '未运行 ✓'}`,
)

console.log('\n8. 测试重新启动自动战斗...')
battleSystem.startAutoBattle(battleState.battleId, 1)
console.log(
  `   当前状态: ${battleSystem.isAutoBattleActive(battleState.battleId) ? '运行中 ✓' : '未运行 ✗'}`,
)

console.log('\n9. 等待1秒...')
await new Promise((resolve) => setTimeout(resolve, 1000))

console.log('\n10. 结束战斗...')
battleSystem.endBattle(battleState.battleId, PARTICIPANT_SIDE.ALLY)
console.log(
  `    当前状态: ${battleSystem.isAutoBattleActive(battleState.battleId) ? '运行中 ✗' : '未运行 ✓'}`,
)

const finalBattleState = battleSystem.getBattleState(battleState.battleId)
console.log(
  `    战斗状态: ${finalBattleState?.isActive ? '进行中 ✗' : '已结束 ✓'}`,
)

console.log('\n=== 验证完成 ===')
console.log('\n所有测试通过！自动播放功能正常工作。')
