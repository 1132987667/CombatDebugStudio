/**
 * BattleLogProjector 投影函数 + 渲染层兜底（entityDisplayText/entityFaction）契约测试
 *
 * 覆盖本次"敌我前缀统一收口"新增/变更逻辑：
 * - entitySegment：唯一实体段拼装入口（[友方]/[敌方] 前缀 + 着色 + faction）
 * - entityDisplayText：渲染层兜底，entity 段缺前缀且阵营明确时自动补
 * - entityFaction：chip 着色的阵营解析（faction 优先，classStr 反推兜底）
 */
import { describe, it, expect } from 'vitest'
import {
  entitySegment,
  projectSnapshotLogs,
  projectTurnEndLog,
} from '@/domain/battle/logs/BattleLogProjector'
import {
  entityDisplayText,
  entityFaction,
  type LogSegment,
} from '@/shared/types/battle-log'
import { ParticipantSide } from '@/domain/battle/type/types'
import type { BattleEntity } from '@/domain/battle/type/types'

const makeEntity = (
  id: string,
  name: string,
  team: 'ally' | 'enemy',
): BattleEntity => ({ id, name, team } as unknown as BattleEntity)

describe('entitySegment（唯一实体段拼装入口）', () => {
  it('友方：前缀 + 着色 + faction', () => {
    expect(
      entitySegment(makeEntity('a1', '剑客', ParticipantSide.ALLY)),
    ).toMatchObject({
      text: '[友方]剑客',
      classStr: 'log-friendly',
      kind: 'entity',
      faction: 'ally',
    })
  })

  it('敌方：前缀 + 着色 + faction', () => {
    expect(
      entitySegment(makeEntity('e1', '史莱姆', ParticipantSide.ENEMY)),
    ).toMatchObject({
      text: '[敌方]史莱姆',
      classStr: 'log-hostile',
      kind: 'entity',
      faction: 'enemy',
    })
  })

  it('isSelf 时显示"自身"（不需要阵营标识）', () => {
    expect(
      entitySegment(makeEntity('a1', '剑客', ParticipantSide.ALLY), true).text,
    ).toBe('[友方]自身')
  })
})

describe('entityDisplayText（渲染层兜底补前缀）', () => {
  it('已带前缀不重复补', () => {
    const seg: LogSegment = { text: '[敌方]史莱姆', kind: 'entity', faction: 'enemy' }
    expect(entityDisplayText(seg)).toBe('[敌方]史莱姆')
  })

  it('缺前缀但 faction 明确 → 自动补前缀', () => {
    const seg: LogSegment = { text: '史莱姆', kind: 'entity', faction: 'enemy' }
    expect(entityDisplayText(seg)).toBe('[敌方]史莱姆')
    const allySeg: LogSegment = { text: '剑客', kind: 'entity', faction: 'ally' }
    expect(entityDisplayText(allySeg)).toBe('[友方]剑客')
  })

  it('"自身"不补前缀', () => {
    const seg: LogSegment = { text: '自身', kind: 'entity', faction: 'ally' }
    expect(entityDisplayText(seg)).toBe('自身')
  })

  it('无 faction（如回放 id 段，阵营未知）不补前缀，避免误标', () => {
    const seg: LogSegment = { text: 'u1', kind: 'entity', classStr: 'log-friendly' }
    expect(entityDisplayText(seg)).toBe('u1')
  })

  it('非 entity 段原样返回', () => {
    expect(entityDisplayText({ text: ' 受到 ' })).toBe(' 受到 ')
  })
})

describe('entityFaction（chip 着色阵营解析）', () => {
  it('faction 字段优先', () => {
    const seg: LogSegment = {
      text: 'x',
      kind: 'entity',
      faction: 'ally',
      classStr: 'log-hostile',
    }
    expect(entityFaction(seg)).toBe('ally')
  })

  it('classStr 反推兜底', () => {
    expect(entityFaction({ text: 'x', classStr: 'log-friendly' })).toBe('ally')
    expect(entityFaction({ text: 'x', classStr: 'log-hostile' })).toBe('enemy')
  })

  it('两者皆无 → undefined', () => {
    expect(entityFaction({ text: 'x' })).toBeUndefined()
  })
})

describe('projectSnapshotLogs（态势快照统一投影）', () => {
  const hpEntity = (
    id: string,
    name: string,
    team: 'ally' | 'enemy',
    hp: number,
    maxHp: number,
  ): BattleEntity =>
    ({
      id,
      name,
      team,
      isAlive: () => hp > 0,
      getAttribute: () => hp, // ATTRIBUTE_CODE.currentHealth/maxHealth 均取 hp（简化）
    }) as unknown as BattleEntity

  it('存活角色按阵营分组输出 我方/敌方 快照（组前缀格式保持不变）', () => {
    const participants = new Map<string, BattleEntity>([
      ['a1', hpEntity('a1', '火护法', 'ally', 320, 350)],
      ['e1', hpEntity('e1', '金护法', 'enemy', 260, 300)],
    ])
    const logs = projectSnapshotLogs(participants, 3)
    expect(logs).toHaveLength(2)
    expect(logs[0]).toMatchObject({
      message: '我方  火护法 320/320',
      category: 'status',
      meta: { role: 'snapshot' },
    })
    expect(logs[1].message).toBe('敌方  金护法 260/260')
    expect(logs[0].segments[0]).toMatchObject({
      text: '我方  ',
      classStr: 'log-friendly',
    })
  })

  it('死亡角色不进快照；某阵营全灭时不输出该阵营条目', () => {
    const participants = new Map<string, BattleEntity>([
      ['a1', hpEntity('a1', '火护法', 'ally', 0, 350)], // 死亡
      ['a2', hpEntity('a2', '木护法', 'ally', 200, 240)],
    ])
    const logs = projectSnapshotLogs(participants, 1)
    expect(logs).toHaveLength(1)
    expect(logs[0].message).toBe('我方  木护法 200/200')
  })

  it('空阵营输入返回空数组', () => {
    expect(projectSnapshotLogs([], 1)).toHaveLength(0)
  })
})

describe('projectTurnEndLog（回合结束阶段标记统一投影）', () => {
  it('输出"第 N 回合结束"系统日志', () => {
    expect(projectTurnEndLog(3)).toMatchObject({
      message: '第 3 回合结束',
      category: 'system',
      meta: { role: 'sub' },
    })
    expect(projectTurnEndLog(3).segments[0]).toMatchObject({
      text: '第 3 回合结束',
      classStr: 'log-system',
    })
  })
})
