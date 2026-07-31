/**
 * RoundNarrativeRenderer 单元测试
 *
 * 覆盖回合标签状态前置（击杀!/多重触发/显式 roundTag 默认值）与 result 高亮激活。
 */
import { describe, it, expect } from 'vitest'
import { RoundNarrativeRenderer } from '@/domain/battle/logs/renderers/RoundNarrativeRenderer'
import type {
  BattleLogEntry,
  BattleLogMeta,
  LogSegment,
  NarrativeBlock,
} from '@/shared/types/battle-log'
import { LogType, NarrativeBlockType } from '@/shared/types/battle-log'

function entry(turn: number, meta: BattleLogMeta = {}): BattleLogEntry {
  return {
    turn,
    message: 'x',
    index: -1,
    type: LogType.BATTLE,
    segments: [{ text: 'x' }],
    meta,
  }
}

function roundBlocks(blocks: NarrativeBlock[]): Extract<NarrativeBlock, { type: 'round' }>[] {
  return blocks.filter(
    (b) => b.type === NarrativeBlockType.ROUND,
  ) as Extract<NarrativeBlock, { type: 'round' }>[]
}

function actionBlocks(blocks: NarrativeBlock[]): Extract<NarrativeBlock, { type: 'action' }>[] {
  return blocks.filter(
    (b) => b.type === NarrativeBlockType.ACTION,
  ) as Extract<NarrativeBlock, { type: 'action' }>[]
}

describe('RoundNarrativeRenderer.renderEntries', () => {
  const renderer = new RoundNarrativeRenderer()

  it('本回合有击杀 → 回合标签为 击杀!（归属本回合，不串到下一回合）', () => {
    const blocks = renderer.renderEntries([
      entry(1, { role: 'action' }),
      entry(1, { role: 'sub' }),
      entry(2, { role: 'action', kill: true }),
      entry(2, { role: 'sub' }),
    ])
    const rounds = roundBlocks(blocks)
    expect(rounds).toHaveLength(2)
    expect(rounds[0].tag).toBeUndefined()
    expect(rounds[1].tag).toBe('击杀!')
  })

  it('回合内 sub 超过 3 条且无击杀 → 多重触发', () => {
    const blocks = renderer.renderEntries([
      entry(1, { role: 'action' }),
      entry(1, { role: 'sub' }),
      entry(1, { role: 'sub' }),
      entry(1, { role: 'sub' }),
      entry(1, { role: 'sub' }),
    ])
    expect(roundBlocks(blocks)[0].tag).toBe('多重触发')
  })

  it('无击杀且 sub 不超过 3 → 无标签', () => {
    const blocks = renderer.renderEntries([
      entry(1, { role: 'action' }),
      entry(1, { role: 'sub' }),
      entry(1, { role: 'sub' }),
    ])
    expect(roundBlocks(blocks)[0].tag).toBeUndefined()
  })

  it('meta.roundTag 作为显式默认值（无统计时原样保留）', () => {
    const blocks = renderer.renderEntries([
      entry(1, { role: 'action', roundTag: '自定义标签' }),
    ])
    expect(roundBlocks(blocks)[0].tag).toBe('自定义标签')
  })

  it('击杀优先于多重触发', () => {
    const blocks = renderer.renderEntries([
      entry(1, { role: 'action', kill: true }),
      entry(1, { role: 'sub' }),
      entry(1, { role: 'sub' }),
      entry(1, { role: 'sub' }),
      entry(1, { role: 'sub' }),
    ])
    expect(roundBlocks(blocks)[0].tag).toBe('击杀!')
  })

  it('action 块 result 输出暴击/击杀高亮，普通行动无 result', () => {
    const blocks = renderer.renderEntries([
      entry(1, { role: 'action', crit: true, kill: true }),
      entry(1, { role: 'sub' }),
      entry(2, { role: 'action' }),
    ])
    const actions = actionBlocks(blocks)
    expect(actions).toHaveLength(2)
    const resultText = (segs?: LogSegment[]) => segs?.map((s) => s.text).join('') ?? ''
    expect(resultText(actions[0].result)).toContain('★ 暴击!')
    expect(resultText(actions[0].result)).toContain('✦ 击杀!')
    expect(actions[1].result).toBeUndefined()
  })

  it('空输入返回空数组', () => {
    expect(renderer.renderEntries([])).toEqual([])
  })
})
