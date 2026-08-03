/**
 * 文件: demo-archive.ts
 * 功能: 昊天镜双工作台演示存档（翻译自《调试日志UI-V4.html》ARCHIVE）
 * 描述: 覆盖全部 phase 与富 payload 形态（steps/rolls/chain/candidates/fields/anchor/snapshot），
 *       供双工作台全功能自检与离线演示。真实录制经 UnifiedArchiveService.fromRecordedBattle 映射。
 * NOTE: buildArchiveIndices 会原地注入 _delta / rolls.idx，因此对外提供 createDemoArchive()（结构化克隆）。
 */

import type { UnifiedArchive, UnifiedEvent } from './unified-archive'

const ev = (e: Omit<UnifiedEvent, '_delta'>): UnifiedEvent => e

export const DEMO_ARCHIVE: UnifiedArchive = {
  battleId: 'BT-9527',
  replayId: 'rp-0001',
  version: '2.0.0',
  randomSeed: '88237419',
  startTime: 1785513262000,
  winner: 'u1',
  checksum: 'a3f8c2e1',
  initialState: {
    participants: [
      { id: 'u1', name: '剑士 · 阿尔托莉雅', maxHp: 3200, hp: 3200, maxEnergy: 100, energy: 100, side: 'ally', buffs: [{ name: '魔力放出', stacks: 3, turns: 3 }] },
      { id: 'u2', name: '骷髅战士', maxHp: 1500, hp: 1500, maxEnergy: 100, energy: 60, side: 'enemy', buffs: [] },
    ],
  },
  events: [
    ev({ id: 'ev00', phase: 'battle_lifecycle', correlationId: 'corr_root', timestamp: 0, randomSeed: '88237419', level: 'info', payload: { action: 'battle_start', engine: 'Aegis 2.4.1' }, summary: '战斗开始 · 种子 88237419' }),
    ev({ id: 'ev01', phase: 'config_load', correlationId: 'corr_cfg', timestamp: 60, level: 'debug', payload: { configs: 14, validated: true }, summary: '技能配置加载 14 条 · 校验通过' }),
    ev({
      id: 'ev02', phase: 'turn_flow', correlationId: 'corr_t1', timestamp: 200, level: 'info', turn: 1,
      payload: {
        action: 'start', turn: 1,
        anchor: { participants: [
          { id: 'u1', hp: 3200, energy: 100, buffs: [{ name: '魔力放出', stacks: 3, turns: 3 }] },
          { id: 'u2', hp: 1500, energy: 70, buffs: [] },
        ] },
      },
      summary: '第 1 回合开始 · 全量锚点',
    }),
    ev({
      id: 'ev03', phase: 'damage_calculation', correlationId: 'corr_t1', parentId: 'ev02', timestamp: 340, level: 'info', targetId: 'u2',
      payload: { steps: [{ n: '灼烧基础值', op: '', v: 120, src: 'buff.scorch' }], result: 120, dot: true },
      snapshot: { turn: 1, participants: [{ id: 'u2', hp: 1380 }] },
      summary: '骷髅战士 受到 [烈焰灼烧] 120 点伤害',
    }),
    ev({
      id: 'ev04', phase: 'action_execution', correlationId: 'corr_1_1', timestamp: 950, level: 'info', sourceId: 'u1', targetId: 'u2',
      payload: { skill: '誓约胜利之剑', hits: 3, controlMode: 'player' },
      snapshot: { turn: 1, participants: [{ id: 'u1', energy: 60 }] },
      summary: '剑士 使用 [誓约胜利之剑] → 骷髅战士（3 段）',
    }),
    ev({
      id: 'ev05', phase: 'damage_calculation', correlationId: 'corr_1_1', parentId: 'ev04', timestamp: 1100, level: 'info', sourceId: 'u1', targetId: 'u2',
      payload: {
        seg: 1, crit: true,
        steps: [
          { n: '技能基础值', op: '', v: 200, src: 'skill_cfg.base' },
          { n: '攻击力', op: '+', v: 450, src: 'unit.atk' },
          { n: '防御减免', op: '−', v: 150, src: 'target.def' },
          { n: '暴击倍率', op: '×', v: 1.5, src: 'crit_rate' },
          { n: '属性克制', op: '×', v: 1.2, src: 'fire → ice' },
        ],
        rolls: [{ kind: 'hit', rate: 0.875, roll: 0.642 }, { kind: 'crit', rate: 0.25, roll: 0.12 }],
        result: 900,
      },
      snapshot: { turn: 1, participants: [{ id: 'u2', hp: 480 }] },
      summary: '第 1 段 · 暴击 900 伤害',
    }),
    ev({
      id: 'ev06', phase: 'damage_calculation', correlationId: 'corr_1_1', parentId: 'ev04', timestamp: 1250, level: 'info', sourceId: 'u1', targetId: 'u2',
      payload: { seg: 2, dodge: true, rolls: [{ kind: 'hit', rate: 0.875, roll: 0.913 }], result: 0 },
      summary: '第 2 段 · 被闪避',
    }),
    ev({
      id: 'ev07', phase: 'damage_calculation', correlationId: 'corr_1_1', parentId: 'ev04', timestamp: 1400, level: 'info', sourceId: 'u1', targetId: 'u2',
      payload: {
        seg: 3,
        steps: [
          { n: '技能基础值', op: '', v: 200, src: 'skill_cfg.base' },
          { n: '攻击力', op: '+', v: 450, src: 'unit.atk' },
          { n: '防御减免', op: '−', v: 150, src: 'target.def' },
          { n: '暴击倍率', op: '×', v: 1.0, src: 'crit_rate' },
          { n: '护盾吸收', op: '−', v: 80, src: 'buff_031' },
        ],
        rolls: [{ kind: 'hit', rate: 0.875, roll: 0.451 }, { kind: 'resist', rate: 0.3, roll: 0.152, buff: '破甲' }],
        result: 420,
      },
      snapshot: { turn: 1, participants: [{ id: 'u2', hp: 60 }] },
      summary: '第 3 段 · 420 伤害（护盾吸收 80）',
    }),
    ev({
      id: 'ev08', phase: 'buff_lifecycle', correlationId: 'corr_1_1', parentId: 'ev04', timestamp: 1500, level: 'info', sourceId: 'u1', targetId: 'u2',
      payload: { action: 'apply', buff: '破甲', resisted: true },
      summary: '施加 [破甲] → 被抵抗',
    }),
    ev({
      id: 'ev09', phase: 'ai_decision', correlationId: 'corr_1_2', parentId: 'ev10', timestamp: 1900, level: 'debug', sourceId: 'u2',
      payload: { candidates: [{ id: 'u1', name: '剑士', score: 88 }, { id: 'u2', name: '自身', score: 12 }], chosen: 'u1' },
      summary: 'AI 决策 · 目标：剑士（威胁评分 88）',
    }),
    ev({
      id: 'ev10', phase: 'action_execution', correlationId: 'corr_1_2', timestamp: 1980, level: 'info', sourceId: 'u2', targetId: 'u1',
      payload: { skill: '骨刺', hits: 1, controlMode: 'ai' },
      snapshot: { turn: 1, participants: [{ id: 'u2', energy: 50 }] },
      summary: '骷髅战士 使用 [骨刺] → 剑士',
    }),
    ev({
      id: 'ev11', phase: 'damage_calculation', correlationId: 'corr_1_2', parentId: 'ev10', timestamp: 2120, level: 'info', sourceId: 'u2', targetId: 'u1',
      payload: {
        steps: [
          { n: '技能基础值', op: '', v: 120, src: 'skill_cfg.base' },
          { n: '攻击力', op: '+', v: 260, src: 'unit.atk' },
          { n: '防御减免', op: '−', v: 230, src: 'target.def' },
          { n: '易伤加成', op: '×', v: 1.2, src: 'debuff_012' },
        ],
        rolls: [{ kind: 'hit', rate: 0.8, roll: 0.356 }],
        result: 180,
      },
      snapshot: { turn: 1, participants: [{ id: 'u1', hp: 3020 }] },
      summary: '180 伤害 · 易伤生效',
    }),
    ev({
      id: 'ev12', phase: 'passive_trigger', correlationId: 'corr_1_2', parentId: 'ev11', timestamp: 2220, level: 'info', sourceId: 'u1',
      payload: {
        passive: '骑士直觉', chance: 0.3,
        rolls: [{ kind: 'passive', rate: 0.3, roll: 0.22 }],
        chain: [
          { t: '受到攻击', d: '骷髅战士 → 剑士 · 骨刺' },
          { t: '触发被动', d: '剑士【骑士直觉】：受击时 30% 概率反击' },
          { t: '执行反击', d: '剑士 → 骷髅战士 · 即时反击' },
        ],
      },
      summary: '被动 [骑士直觉] 触发 → 反击',
    }),
    ev({
      id: 'ev13', phase: 'damage_calculation', correlationId: 'corr_1_2', parentId: 'ev12', timestamp: 2340, level: 'info', sourceId: 'u1', targetId: 'u2',
      payload: {
        counter: true,
        steps: [
          { n: '反击基础值', op: '', v: 60, src: 'passive.base' },
          { n: '攻击力', op: '+', v: 120, src: 'unit.atk' },
          { n: '防御减免', op: '−', v: 140, src: 'target.def' },
        ],
        result: 40,
      },
      snapshot: { turn: 1, participants: [{ id: 'u2', hp: 20 }] },
      summary: '被动反击 · 40 伤害',
    }),
    ev({
      id: 'ev14', phase: 'attribute_recalc', correlationId: 'corr_1_2', parentId: 'ev12', timestamp: 2440, level: 'debug', sourceId: 'u1',
      payload: { fields: [{ k: 'ATK', from: 450, to: 517 }], reason: '反击后 [魔力放出] 增算' },
      summary: '属性重算 · 剑士 ATK 450 → 517',
    }),
    ev({
      id: 'ev15', phase: 'turn_flow', correlationId: 'corr_t1e', timestamp: 2700, level: 'info', turn: 1,
      payload: { action: 'end', turn: 1 },
      summary: '第 1 回合结束',
    }),
    ev({
      id: 'ev16', phase: 'buff_lifecycle', correlationId: 'corr_t1e', parentId: 'ev15', timestamp: 2760, level: 'info', targetId: 'u1',
      payload: { action: 'update', buff: '魔力放出', stacks: 2, turns: 2 },
      summary: '[魔力放出] 层数 3 → 2',
    }),
    ev({
      id: 'ev17', phase: 'turn_flow', correlationId: 'corr_t2', timestamp: 3000, level: 'info', turn: 2,
      payload: {
        action: 'start', turn: 2,
        anchor: { participants: [
          { id: 'u1', hp: 3020, energy: 70, buffs: [{ name: '魔力放出', stacks: 2, turns: 2 }] },
          { id: 'u2', hp: 20, energy: 60, buffs: [] },
        ] },
      },
      summary: '第 2 回合开始 · 全量锚点',
    }),
    ev({
      id: 'ev18', phase: 'damage_calculation', correlationId: 'corr_t2', parentId: 'ev17', timestamp: 3140, level: 'warn', targetId: 'u2',
      payload: { steps: [{ n: '灼烧基础值', op: '', v: 120, src: 'buff.scorch' }], result: 120, dot: true, death: true },
      snapshot: { turn: 2, participants: [{ id: 'u2', hp: 0 }] },
      summary: '骷髅战士 受到灼烧 120 · HP 归零，阵亡',
    }),
    ev({
      id: 'ev19', phase: 'battle_lifecycle', correlationId: 'corr_end', timestamp: 3600, level: 'info',
      payload: { action: 'battle_end', winner: 'u1', rounds: 2 },
      summary: '战斗结束 · 剑士获胜',
    }),
  ],
}

/** 返回结构化克隆的演示存档（避免 buildArchiveIndices 原地注入污染模块常量） */
export function createDemoArchive(): UnifiedArchive {
  return structuredClone(DEMO_ARCHIVE)
}
