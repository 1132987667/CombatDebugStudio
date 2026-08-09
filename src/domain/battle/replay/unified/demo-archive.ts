/**
 * 文件: demo-archive.ts
 * 功能: 昊天镜双工作台演示存档（翻译自《调试日志UI-V4.html》ARCHIVE）
 * 描述: 覆盖全部 phase 与富 payload 形态（steps/rolls/chain/candidates/fields/anchor/snapshot），
 *       供双工作台全功能自检与离线演示。真实录制经 UnifiedArchiveService.fromRecordedBattle 映射。
 * NOTE: buildArchiveIndices 会原地注入 _delta / rolls.idx，因此对外提供 createDemoArchive()（结构化克隆）。
 * NOTE: 参与者取自 configs/enemies/enemies.json 的真实角色（火护法 vs 金护法），
 *       技能/Buff 名与数值均对齐现有系统，事件流骨架为合成（真实录制难覆盖全部 phase）。
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
      {
        id: 'u1', name: '火护法', maxHp: 350, hp: 350, maxEnergy: 100, energy: 100, side: 'ally', buffs: [{ name: '复仇怒火', stacks: 1, turns: -1 }],
        attributes: { attack: 65, defense: 20, speed: 90, critRate: 25, critDamage: 150, damageReduction: 5, dodge: 8, hit: 90, comboRate: 35 },
      },
      {
        id: 'u2', name: '金护法', maxHp: 500, hp: 500, maxEnergy: 100, energy: 60, side: 'enemy', buffs: [],
        attributes: { attack: 58, defense: 32, speed: 70, critRate: 10, critDamage: 125, damageReduction: 12, dodge: 10, hit: 90, trueDamageRate: 20, reflectDamagePercent: 15 },
      },
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
          { id: 'u1', hp: 350, energy: 100, buffs: [{ name: '复仇怒火', stacks: 1, turns: -1 }] },
          { id: 'u2', hp: 500, energy: 70, buffs: [] },
        ] },
      },
      summary: '第 1 回合开始',
    }),
    ev({
      id: 'ev03', phase: 'damage_calculation', correlationId: 'corr_t1', parentId: 'ev02', timestamp: 340, level: 'info', targetId: 'u2',
      payload: { steps: [{ n: '中毒基础值', op: '', v: 15, src: 'buff.poison' }], result: 15, dot: true },
      snapshot: { turn: 1, participants: [{ id: 'u2', hp: 485 }] },
      summary: '金护法 受到 [中毒] 15 点伤害',
    }),
    ev({
      id: 'ev04', phase: 'action_execution', correlationId: 'corr_1_1', timestamp: 950, level: 'info', sourceId: 'u1', targetId: 'u2',
      payload: { skill: '普通攻击', hits: 3, controlMode: 'player' },
      snapshot: { turn: 1, participants: [{ id: 'u1', energy: 60 }] },
      summary: '火护法 使用 [普通攻击] → 金护法（3 段 · 连击之心）',
    }),
    ev({
      id: 'ev05', phase: 'damage_calculation', correlationId: 'corr_1_1', parentId: 'ev04', timestamp: 1100, level: 'info', sourceId: 'u1', targetId: 'u2',
      payload: {
        seg: 1, crit: true,
        steps: [
          { n: '技能基础值', op: '', v: 20, src: 'skill_cfg.base' },
          { n: '攻击力', op: '+', v: 65, src: 'unit.atk' },
          { n: '防御减免', op: '−', v: 15, src: 'target.def' },
          { n: '暴击倍率', op: '×', v: 1.5, src: 'crit_rate' },
          { n: '复仇怒火', op: '+', v: 8, src: 'buff_guardian_revenge_rage' },
        ],
        rolls: [{ kind: 'hit', rate: 0.875, roll: 0.642 }, { kind: 'crit', rate: 0.25, roll: 0.12 }],
        result: 113,
      },
      snapshot: { turn: 1, participants: [{ id: 'u2', hp: 372 }] },
      summary: '第 1 段 · 暴击 113 伤害',
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
          { n: '技能基础值', op: '', v: 20, src: 'skill_cfg.base' },
          { n: '攻击力', op: '+', v: 65, src: 'unit.atk' },
          { n: '防御减免', op: '−', v: 15, src: 'target.def' },
          { n: '连击倍率', op: '×', v: 1.0, src: 'passive.combo_heart' },
          { n: '金甲护体', op: '−', v: 12, src: 'buff_gold_shield' },
        ],
        rolls: [{ kind: 'hit', rate: 0.875, roll: 0.451 }, { kind: 'resist', rate: 0.3, roll: 0.152, buff: '破甲打击' }],
        result: 58,
      },
      snapshot: { turn: 1, participants: [{ id: 'u2', hp: 314 }] },
      summary: '第 3 段 · 58 伤害（金甲护体吸收 12）',
    }),
    ev({
      id: 'ev08', phase: 'buff_lifecycle', correlationId: 'corr_1_1', parentId: 'ev04', timestamp: 1500, level: 'info', sourceId: 'u1', targetId: 'u2',
      payload: { action: 'apply', buff: '破甲打击', resisted: true },
      summary: '施加 [破甲打击] → 被抵抗',
    }),
    ev({
      id: 'ev09', phase: 'ai_decision', correlationId: 'corr_1_2', parentId: 'ev10', timestamp: 1900, level: 'debug', sourceId: 'u2',
      payload: { candidates: [{ id: 'u1', name: '火护法', score: 82 }, { id: 'u2', name: '自身', score: 18 }], chosen: 'u1' },
      summary: 'AI 决策 · 目标：火护法（威胁评分 82）',
    }),
    ev({
      id: 'ev10', phase: 'action_execution', correlationId: 'corr_1_2', timestamp: 1980, level: 'info', sourceId: 'u2', targetId: 'u1',
      payload: { skill: '普通攻击', hits: 1, controlMode: 'ai' },
      snapshot: { turn: 1, participants: [{ id: 'u2', energy: 50 }] },
      summary: '金护法 使用 [普通攻击] → 火护法',
    }),
    ev({
      id: 'ev11', phase: 'damage_calculation', correlationId: 'corr_1_2', parentId: 'ev10', timestamp: 2120, level: 'info', sourceId: 'u2', targetId: 'u1',
      payload: {
        steps: [
          { n: '技能基础值', op: '', v: 15, src: 'skill_cfg.base' },
          { n: '攻击力', op: '+', v: 50, src: 'unit.atk' },
          { n: '防御减免', op: '−', v: 8, src: 'target.def' },
          { n: '易伤加成', op: '×', v: 1.1, src: 'buff_yishang' },
        ],
        rolls: [{ kind: 'hit', rate: 0.8, roll: 0.356 }],
        result: 63,
      },
      snapshot: { turn: 1, participants: [{ id: 'u1', hp: 287 }] },
      summary: '63 伤害 · 易伤生效',
    }),
    ev({
      id: 'ev12', phase: 'passive_trigger', correlationId: 'corr_1_2', parentId: 'ev11', timestamp: 2220, level: 'info', sourceId: 'u1',
      payload: {
        // 契约字段（§2.6）：verdict/passiveId/passiveName/owner 与 PassiveSkillManager 真实发射形态一致，
        // 缺失会导致演示战报 L6 被动统计恒为空（统计层只认这组字段）
        passiveId: 'buff_guardian_revenge_rage', passiveName: '复仇怒火', owner: '火护法',
        verdict: 'TRIGGERED',
        passive: '复仇怒火', chance: 0.35,
        rolls: [{ kind: 'passive', rate: 0.35, roll: 0.22 }],
        chain: [
          { t: '受到攻击', d: '金护法 → 火护法 · 普通攻击' },
          { t: '触发被动', d: '火护法【复仇怒火】：受击时 35% 概率反击' },
          { t: '执行反击', d: '火护法 → 金护法 · 即时反击' },
        ],
      },
      summary: '被动 [复仇怒火] 触发 → 反击',
    }),
    ev({
      id: 'ev13', phase: 'damage_calculation', correlationId: 'corr_1_2', parentId: 'ev12', timestamp: 2340, level: 'info', sourceId: 'u1', targetId: 'u2',
      payload: {
        counter: true,
        steps: [
          { n: '反击基础值', op: '', v: 12, src: 'passive.base' },
          { n: '攻击力', op: '+', v: 30, src: 'unit.atk' },
          { n: '防御减免', op: '−', v: 10, src: 'target.def' },
        ],
        result: 32,
      },
      snapshot: { turn: 1, participants: [{ id: 'u2', hp: 282 }] },
      summary: '被动反击 · 32 伤害',
    }),
    ev({
      id: 'ev14', phase: 'attribute_recalc', correlationId: 'corr_1_2', parentId: 'ev12', timestamp: 2440, level: 'debug', sourceId: 'u1',
      payload: { fields: [{ k: 'ATK', from: 65, to: 72 }], reason: '反击后 [复仇怒火] 增算' },
      summary: '属性重算 · 火护法 ATK 65 → 72',
    }),
    ev({
      id: 'ev15', phase: 'turn_flow', correlationId: 'corr_t1e', timestamp: 2700, level: 'info', turn: 1,
      payload: { action: 'end', turn: 1 },
      summary: '第 1 回合结束',
    }),
    ev({
      id: 'ev16', phase: 'buff_lifecycle', correlationId: 'corr_t1e', parentId: 'ev15', timestamp: 2760, level: 'info', targetId: 'u1',
      payload: { action: 'update', buff: '复仇怒火', stacks: 2, turns: -1 },
      summary: '[复仇怒火] 层数 1 → 2',
    }),
    ev({
      id: 'ev17', phase: 'turn_flow', correlationId: 'corr_t2', timestamp: 3000, level: 'info', turn: 2,
      payload: {
        action: 'start', turn: 2,
        anchor: { participants: [
          { id: 'u1', hp: 287, energy: 70, buffs: [{ name: '复仇怒火', stacks: 2, turns: -1 }] },
          { id: 'u2', hp: 282, energy: 60, buffs: [] },
        ] },
      },
      summary: '第 2 回合开始',
    }),
    ev({
      id: 'ev18', phase: 'damage_calculation', correlationId: 'corr_t2', parentId: 'ev17', timestamp: 3140, level: 'warn', sourceId: 'u1', targetId: 'u2',
      payload: {
        seg: 3,
        steps: [
          { n: '技能基础值', op: '', v: 30, src: 'skill_cfg.base' },
          { n: '攻击力', op: '+', v: 75, src: 'unit.atk' },
          { n: '防御减免', op: '−', v: 20, src: 'target.def' },
          { n: '暴击倍率', op: '×', v: 1.5, src: 'crit_rate' },
          { n: '连击之心 × 3', op: '×', v: 2.4, src: 'passive.combo_heart' },
        ],
        rolls: [{ kind: 'hit', rate: 0.875, roll: 0.2 }, { kind: 'crit', rate: 0.25, roll: 0.05 }],
        result: 306,
        death: true,
      },
      snapshot: { turn: 2, participants: [{ id: 'u2', hp: 0 }] },
      summary: '连击终结 306 · HP 归零，阵亡',
    }),
    ev({
      id: 'ev19', phase: 'battle_lifecycle', correlationId: 'corr_end', timestamp: 3600, level: 'info',
      payload: { action: 'battle_end', winner: 'u1', rounds: 2 },
      summary: '战斗结束 · 火护法获胜',
    }),
  ],
}

/** 返回结构化克隆的演示存档（避免 buildArchiveIndices 原地注入污染模块常量） */
export function createDemoArchive(): UnifiedArchive {
  return structuredClone(DEMO_ARCHIVE)
}
