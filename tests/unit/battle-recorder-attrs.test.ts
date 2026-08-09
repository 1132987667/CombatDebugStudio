/**
 * BattleRecorder 初始属性快照测试
 *
 * 背景：昊天镜"角色属性"面板数据源 = 存档 participants.attributes。
 *       该字段由 BattleRecorder.startRecording 冻结时从领域实体提取
 *       （省略 0 值与运行时状态 hp/energy，见 BattleRecorder.snapshotAttributes）。
 *
 * 运行: npx vitest run tests/unit/battle-recorder-attrs.test.ts
 */
import { describe, it, expect } from 'vitest'
import { BattleRecorder } from '@/domain/battle/service/BattleRecorder'
import type { BattleEntity } from '@/domain/battle/type/types'

describe('BattleRecorder 初始属性快照', () => {
  const entity = {
    id: 'a', name: '甲', team: 'ally',
    maxHealth: 100, currentHealth: 100, maxEnergy: 100, currentEnergy: 50,
    getAttribute: (code: string) => {
      if (code === 'attack') return 80
      if (code === 'critRate') return 25
      return 0
    },
  } as unknown as BattleEntity

  it('startRecording 冻结 attributes：收录非 0 属性，跳过运行时状态与 0 值', () => {
    const recorder = new BattleRecorder()
    recorder.startRecording('b_attrs', { participants: [entity] })
    const rec = recorder.getRecording('b_attrs')
    expect(rec?.initialState.participants[0]).toMatchObject({
      id: 'a',
      attributes: { attack: 80, critRate: 25 },
    })
    const attrs = rec?.initialState.participants[0].attributes
    // 运行时状态（currentHealth/currentEnergy/shield）不入 attributes
    expect(attrs).not.toHaveProperty('currentHealth')
    expect(attrs).not.toHaveProperty('currentEnergy')
    expect(attrs).not.toHaveProperty('shield')
    // 0 值属性省略
    expect(attrs).not.toHaveProperty('defense')
  })
})
