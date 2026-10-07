/**
 * battle-session.test.ts — 挂机会话战利品累计测试（AGENTS.md：非琐碎逻辑留可运行检查）
 * 覆盖: 跨次结算累计、同物品合并数量、0 值不记、清零
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { battleSession, recordSessionGain, resetBattleSession } from '@/presentation/modules/yanjie/xiyou/battleSession'

beforeEach(() => resetBattleSession())

describe('battleSession 挂机会话累计', () => {
  it('跨次结算累计经验/金钱/灵韵（多关挂机持续累加）', () => {
    recordSessionGain({ exp: 100, money: 50, xianyuan: 10 })
    recordSessionGain({ exp: 200, money: 60, xianyuan: 12 })
    expect(battleSession.exp).toBe(300)
    expect(battleSession.money).toBe(110)
    expect(battleSession.xianyuan).toBe(22)
  })

  it('掉落同物品合并数量，不同物品独立条目', () => {
    recordSessionGain({ drops: [{ itemId: 'mat_taomu', quantity: 2 }, { itemId: 'mat_cushi', quantity: 1 }] })
    recordSessionGain({ drops: [{ itemId: 'mat_taomu', quantity: 3 }] })
    expect(battleSession.drops).toEqual([
      { itemId: 'mat_taomu', quantity: 5 },
      { itemId: 'mat_cushi', quantity: 1 },
    ])
  })

  it('0 值与 0 数量不记（不掉落场次不产生噪音条目）', () => {
    recordSessionGain({ exp: 0, money: 0, xianyuan: 0, drops: [{ itemId: 'mat_taomu', quantity: 0 }] })
    expect(battleSession.exp).toBe(0)
    expect(battleSession.drops).toEqual([])
  })

  it('清零重置全部（信息条「清零」按钮语义；不影响已入包物品）', () => {
    recordSessionGain({ exp: 100, drops: [{ itemId: 'mat_taomu', quantity: 2 }] })
    resetBattleSession()
    expect(battleSession.exp).toBe(0)
    expect(battleSession.drops).toEqual([])
  })
})
