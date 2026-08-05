/**
 * BattleLogProjector — 领域事件 → 战斗日志的投影器（SSOT 第一步）
 *
 * 第一性原理：日志不应由各模块手工拼装（38 处 addBattleLog 分散调用），
 * 而应从"领域事件"投影。本投影器先覆盖被动触发日志——
 * 输入（被动触发上下文 + 已渲染 effects），输出标准化的 BattleLogEntry
 * （message/segments/meta），并补全因果链字段（triggerPhase/sourceId）。
 *
 * 后续迁移路径（TODO）：
 * - BattleExecutor 攻击/技能日志 → 从 CombatRecord 投影
 * - BattleReplayManager 回放日志 → 从 CombatRecord 投影（消除"[回放]"独立格式）
 * - 回合开始/结束阶段标记 → 由投影器统一生成
 */
import type {
  BattleLogCategory,
  BattleLogMeta,
  LogSegment,
} from '@/shared/types/battle-log'
import { BATTLE_LOG_CATEGORIES } from '@/shared/types/battle-log'
import { skillSegment, type SkillConfigLookup } from '@/shared/utils/log-segment-factory'
import type { BattleEntity } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import {
  BattleTriggerPhase,
  ParticipantSide,
  ParticipantSideName,
  type PassiveTriggerContext,
} from '@/domain/battle/type/types'

/** 独立触发阶段（无父 action）使用 plain 渲染；行动内触发保持 sub 附加 */
const STANDALONE_PHASES: BattleTriggerPhase[] = [
  BattleTriggerPhase.BATTLE_START,
  BattleTriggerPhase.TURN_START,
  BattleTriggerPhase.TURN_END,
]

export interface PassiveLogInput {
  /** 被动技能展示名 */
  passiveName: string
  /** 被动注册 id（含角色/技能/触发时机后缀） */
  passiveId: string
  /** 被动所有者（触发者） */
  source: BattleEntity
  /** EffectRenderer 已渲染的效果片段（可为空 = 仅"生效"） */
  segments: LogSegment[]
  /** 触发上下文（含 phase，即因果链的"为什么"） */
  context: PassiveTriggerContext
}

export interface ProjectedLog {
  message: string
  segments: LogSegment[]
  category: BattleLogCategory
  meta: BattleLogMeta
}

/**
 * 构建带阵营前缀和着色的实体片段（与历史格式一致）
 * 从 BattleExecutor.buildEntitySegment 提炼，供所有日志投影复用（单一实现）
 */
export function entitySegment(
  entity: BattleEntity,
  isSelf: boolean = false,
): LogSegment {
  const prefix = `[${ParticipantSideName[entity.team]}]`
  const name = isSelf ? '自身' : entity.name
  return {
    text: `${prefix}${name}`,
    classStr:
      entity.team === ParticipantSide.ALLY ? 'log-friendly' : 'log-hostile',
    kind: 'entity',
    faction: entity.team,
  }
}

/**
 * 构建带颜色的数值片段（伤害/治疗）
 * 从 BattleExecutor.buildValueSegment 提炼，供所有日志投影复用
 */
export function valueSegment(
  value: number,
  type: 'damage' | 'heal',
): LogSegment {
  return {
    text: `${value}`,
    classStr: type === 'damage' ? 'log-damage' : 'log-heal',
    kind: type,
  }
}

/**
 * 投影被动触发日志。
 * - 文本与历史格式保持一致（被动名 + 触发者 + 效果），避免破坏现有断言
 * - meta 补全因果链：triggerPhase（触发阶段）+ sourceId（触发者）
 * - standalone 阶段（BATTLE_START/TURN_START/TURN_END）不设 role，保持 plain 渲染
 */
export function projectPassiveLog(input: PassiveLogInput): ProjectedLog {
  const { passiveName, passiveId, source, segments, context } = input

  const passiveNameSeg: LogSegment = {
    text: passiveName,
    classStr: 'log-passive',
    kind: 'passive',
    hover: { kind: 'passive', id: passiveId },
  }
  const sourcePrefix =
    source.team === ParticipantSide.ALLY ? '[友方]' : '[敌方]'
  const sourceSeg: LogSegment = {
    text: `${sourcePrefix}${source.name}`,
    classStr:
      source.team === ParticipantSide.ALLY ? 'log-friendly' : 'log-hostile',
    kind: 'entity',
    faction: source.team,
  }
  const logSegments: LogSegment[] =
    segments.length > 0
      ? [
          passiveNameSeg,
          { text: '  ' },
          sourceSeg,
          { text: ' ' },
          ...segments,
        ]
      : [passiveNameSeg, { text: '  ' }, sourceSeg, { text: '  生效' }]

  const isStandalone = STANDALONE_PHASES.includes(context.phase)
  const meta: BattleLogMeta = {
    // 因果链：触发阶段 + 触发者（SSOT/第一性原理：日志回答"为什么"）
    triggerPhase: context.phase,
    sourceId: source.id,
    ...(isStandalone ? {} : { role: 'sub' as const }),
  }

  return {
    message: logSegments.map((s) => s.text).join(''),
    segments: logSegments,
    category: BATTLE_LOG_CATEGORIES.STATUS,
    meta,
  }
}

// ═══════════════ 攻击 / 技能日志投影（A1） ═══════════════

/** 单目标结算结果（形状兼容 BattleExecutor.ActionManifest.results） */
export interface ProjectTargetResult {
  target: BattleEntity
  hpBefore: number
  hpAfter: number
  /** 实际伤害（token 记录值） */
  damage: number
  heal: number
  /** 减免前原始伤害 */
  rawDamage: number
}

/** 行动表现清单（形状兼容 BattleExecutor.ActionManifest） */
export interface ProjectActionInput {
  type: 'skill' | 'attack'
  source: BattleEntity
  targets: BattleEntity[]
  skillName: string
  skillId?: string
  isMiss: boolean
  isCrit: boolean
  totalDamage: number
  totalHeal: number
  results: ProjectTargetResult[]
  /** 技能配置查询（来自 SkillManager），缺省时技能名段降级为 skillName */
  skillLookup?: SkillConfigLookup
}

/** 一次行动投影出的日志集合：action 主日志 + result sub 日志（调用方控制 add/flush 时序） */
export interface ProjectedActionLogs {
  action: ProjectedLog
  subs: ProjectedLog[]
}

/**
 * 投影普通攻击日志（miss 或 hit）。
 * - 主日志显示实际伤害（r.damage），与 result sub 行一致（C1）
 * - meta.damage 用实际伤害（修复历史遗留的 rawDamage 混用）
 */
export function projectAttackLog(
  input: ProjectActionInput,
  turn: number,
): ProjectedActionLogs {
  const { source, targets, isMiss, results, isCrit } = input
  const target = targets[0]

  if (isMiss) {
    const missSegs: LogSegment[] = [
      entitySegment(source),
      { text: ' 对 ' },
      entitySegment(target),
      { text: ' 发起「普通攻击」' },
    ]
    return {
      action: {
        message: missSegs.map((s) => s.text).join(''),
        segments: missSegs,
        category: BATTLE_LOG_CATEGORIES.STATUS,
        meta: {
          role: 'action',
          entityId: target.id,
          miss: true,
          skillName: input.skillName,
        },
      },
      subs: [
        {
          message: '被闪避!',
          segments: [{ text: '被闪避!', classStr: 'log-heal' }],
          category: BATTLE_LOG_CATEGORIES.STATUS,
          meta: { role: 'sub', miss: true },
        },
      ],
    }
  }

  const r = results[0]
  // NOTE: 「造成」显示减免前原始伤害（rawDamage），「受到」sub 显示最终承伤 ——
  //       设计口径见 BattleExecutor.TargetResult.rawDamage 注释；rawDamage 缺失时回退最终值
  const shownDamage = r.rawDamage ?? r.damage
  const hitSegs: LogSegment[] = [
    entitySegment(source),
    { text: ' 对 ' },
    entitySegment(target),
    { text: ' 发起「普通攻击」' },
    ...(isCrit ? [{ text: '，★ 暴击!', classStr: 'log-crit' }] : []),
    { text: `，造成 ${shownDamage} 点伤害` },
    ...(!target.isAlive() ? [{ text: '，✦ 击杀!', classStr: 'log-kill' }] : []),
  ]
  const dmgSegs: LogSegment[] = [
    entitySegment(target),
    { text: ' 受到 ' },
    valueSegment(r.damage, 'damage'),
    { text: ` 点伤害  ${r.hpBefore} → ${r.hpAfter}` },
  ]
  return {
    action: {
      message: hitSegs.map((s) => s.text).join(''),
      segments: hitSegs,
      category: isCrit ? BATTLE_LOG_CATEGORIES.CRIT : BATTLE_LOG_CATEGORIES.DAMAGE,
      meta: {
        role: 'action',
        entityId: target.id,
        hpBefore: r.hpBefore,
        hpAfter: r.hpAfter,
        damage: r.damage,
        rawDamage: r.rawDamage,
        crit: isCrit,
        kill: !target.isAlive(),
        skillName: input.skillName,
      },
    },
    subs: [
      {
        message: dmgSegs.map((s) => s.text).join(''),
        segments: dmgSegs,
        category: BATTLE_LOG_CATEGORIES.DAMAGE,
        meta: {
          role: 'sub',
          entityId: target.id,
          hpBefore: r.hpBefore,
          hpAfter: r.hpAfter,
          damage: r.damage,
        },
      },
    ],
  }
}

/**
 * 投影技能日志 — action header + 每目标 result sub（伤害/治疗）。
 * 主日志显示实际伤害总和（totalDamage），与 C1 一致。
 */
export function projectSkillLog(
  input: ProjectActionInput,
  turn: number,
): ProjectedActionLogs {
  const { source, targets, results, totalDamage, totalHeal, isCrit } = input
  const primary = results[0]

  // NOTE: 「造成」显示减免前原始伤害总和，「受到」sub 显示最终承伤 —— 与普通攻击同口径
  const totalRawDamage = results.reduce(
    (sum, r) => sum + (r.rawDamage ?? r.damage),
    0,
  )
  const damageText = totalRawDamage > 0 ? `，造成 ${totalRawDamage} 点伤害` : ''
  const healText = totalHeal > 0 ? `，恢复 ${totalHeal} 点气血` : ''
  const isKill = primary ? !primary.target.isAlive() : false
  const targetSegs: LogSegment[] = []
  targets.forEach((t, i) => {
    if (i > 0) targetSegs.push({ text: ', ' })
    targetSegs.push(entitySegment(t, t.id === source.id))
  })
  const skillId = input.skillId || input.skillName || ''
  let skillSeg: LogSegment
  try {
    if (input.skillLookup) {
      skillSeg = skillSegment(skillId, input.skillLookup)
    } else {
      skillSeg = {
        text: `【${input.skillName || skillId}】`,
        classStr: 'log-skill',
      }
    }
  } catch {
    skillSeg = {
      text: `【${input.skillName || skillId}】`,
      classStr: 'log-skill',
    }
  }
  const headerSegs: LogSegment[] = [
    entitySegment(source),
    { text: ' 对 ' },
    ...targetSegs,
    { text: ' 使用 ' },
    skillSeg,
    ...(isCrit ? [{ text: '，★ 暴击!', classStr: 'log-crit' }] : []),
    { text: `${damageText}${healText}` },
    ...(isKill ? [{ text: '，✦ 击杀!', classStr: 'log-kill' }] : []),
  ]

  let logCategory: BattleLogCategory = BATTLE_LOG_CATEGORIES.STATUS
  if (totalDamage > 0) logCategory = BATTLE_LOG_CATEGORIES.DAMAGE
  else if (totalHeal > 0) logCategory = BATTLE_LOG_CATEGORIES.HEAL

  // result sub：每个目标独立一条（伤害/治疗分行，保持历史格式）
  const subs: ProjectedLog[] = []
  for (const r of results) {
    if (r.damage > 0) {
      const dmgSegs: LogSegment[] = [
        entitySegment(r.target, r.target.id === source.id),
        { text: ' 受到 ' },
        valueSegment(r.damage, 'damage'),
        { text: ` 点伤害  ${r.hpBefore} → ${r.hpAfter}` },
      ]
      subs.push({
        message: dmgSegs.map((s) => s.text).join(''),
        segments: dmgSegs,
        category: BATTLE_LOG_CATEGORIES.DAMAGE,
        meta: {
          role: 'sub',
          entityId: r.target.id,
          hpBefore: r.hpBefore,
          hpAfter: r.hpAfter,
          damage: r.damage,
        },
      })
    }
    if (r.heal > 0) {
      const healSegs: LogSegment[] = [
        entitySegment(r.target, r.target.id === source.id),
        { text: ' 恢复 ' },
        valueSegment(r.heal, 'heal'),
        { text: ` 点气血  ${r.hpBefore} → ${r.hpAfter}` },
      ]
      subs.push({
        message: healSegs.map((s) => s.text).join(''),
        segments: healSegs,
        category: BATTLE_LOG_CATEGORIES.HEAL,
        meta: {
          role: 'sub',
          entityId: r.target.id,
          hpBefore: r.hpBefore,
          hpAfter: r.hpAfter,
          heal: r.heal,
        },
      })
    }
  }

  return {
    action: {
      message: headerSegs.map((s) => s.text).join(''),
      segments: headerSegs,
      category: logCategory,
      meta: {
        role: 'action',
        entityId: primary?.target.id,
        hpBefore: primary?.hpBefore,
        hpAfter: primary?.hpAfter,
        damage: totalDamage,
        rawDamage: totalRawDamage,
        crit: isCrit,
        kill: isKill,
        skillName: input.skillName,
      },
    },
    subs,
  }
}

// ═══════════════ 回放动作日志投影（A2） ═══════════════

/**
 * 回放实体段：能反查到阵营时输出带前缀+着色的名字段；否则退回 id（默认色）。
 * @param fallbackClass 反查失败时的默认着色（历史行为：source 友好 / target 敌对）
 */
function replayEntitySegment(
  id: string,
  entityMap: ReadonlyMap<string, { name: string; team: ParticipantSide }> | undefined,
  fallbackClass: 'log-friendly' | 'log-hostile',
): LogSegment {
  const info = entityMap?.get(id)
  if (!info) {
    return { text: id, classStr: fallbackClass, kind: 'entity' }
  }
  return {
    text: `[${ParticipantSideName[info.team]}]${info.name}`,
    classStr:
      info.team === ParticipantSide.ALLY ? 'log-friendly' : 'log-hostile',
    kind: 'entity',
    faction: info.team,
  }
}

/**
 * 投影回放动作日志（BattleReplayManager）。
 * 回放数据源为录制事件流（BattleAction），无实体对象——实体段以 id 显示。
 * 传入 entityMap（由回放 initialState 建立 id → {name, team} 映射）后，
 * 实体段升级为带 [友方]/[敌方] 前缀 + 阵营着色的名字，与实时日志口径对齐。
 */
export function projectReplayActionLog(
  action: {
    sourceId?: string
    targetId?: string
    type?: string
    skillId?: string
    skillName?: string
    damage?: number
    heal?: number
    isCrit?: boolean
  },
  turn: number,
  entityMap?: ReadonlyMap<string, { name: string; team: ParticipantSide }>,
): ProjectedLog {
  const sourceSeg: LogSegment = action.sourceId
    ? replayEntitySegment(action.sourceId, entityMap, 'log-friendly')
    : { text: '未知', classStr: 'log-friendly', kind: 'entity' }
  const targetSeg: LogSegment = action.targetId
    ? replayEntitySegment(action.targetId, entityMap, 'log-hostile')
    : { text: '未知', classStr: 'log-hostile', kind: 'entity' }
  const isSkill = action.type === 'skill' && !!action.skillName
  const actionSegs: LogSegment[] = isSkill
    ? [
        { text: ' 使用 ' },
        {
          text: `【${action.skillName}】`,
          classStr: 'log-skill',
          kind: 'skill',
          hover: {
            kind: 'skill',
            id: action.skillId || action.skillName || '',
          },
        },
      ]
    : [{ text: ' 发起「普通攻击」' }]
  const dmgText = (action.damage ?? 0) > 0 ? `，造成 ${action.damage} 点伤害` : ''
  const healText = (action.heal ?? 0) > 0 ? `，恢复 ${action.heal} 点气血` : ''
  const valueText = `${dmgText}${healText}`
  const segs: LogSegment[] = [
    sourceSeg,
    { text: ' 对 ' },
    targetSeg,
    ...actionSegs,
    ...(action.isCrit ? [{ text: '，★ 暴击!', classStr: 'log-crit' }] : []),
    ...(valueText ? [{ text: valueText }] : []),
  ]

  let category: BattleLogCategory = BATTLE_LOG_CATEGORIES.STATUS
  if ((action.damage ?? 0) > 0) category = BATTLE_LOG_CATEGORIES.DAMAGE
  else if ((action.heal ?? 0) > 0) category = BATTLE_LOG_CATEGORIES.HEAL

  return {
    message: segs.map((s) => s.text).join(''),
    segments: segs,
    category,
    meta: {
      role: 'action',
      entityId: action.targetId,
      damage: action.damage,
      heal: action.heal,
      crit: action.isCrit,
      skillName: action.skillName,
    },
  }
}

// ═══════════════ 阶段标记 / 态势快照投影（A3/A2） ═══════════════

/**
 * 投影回合态势快照（我方/敌方分组，组前缀表达阵营）。
 * 统一原先分散在 BattleSystem（回合末/终局）与 BattleDataGenerator（补捞）的三处重复实现。
 * 格式保持不变：`我方  名字 hp/maxHp · ...` / `敌方  ...`
 */
export function projectSnapshotLogs(
  participants: Map<string, BattleEntity> | Iterable<BattleEntity>,
  turn: number,
): ProjectedLog[] {
  const iter: Iterable<BattleEntity> =
    participants instanceof Map ? participants.values() : participants
  const allySnapshot: string[] = []
  const enemySnapshot: string[] = []
  for (const p of iter) {
    if (!p.isAlive()) continue
    const hp = p.getAttribute(ATTRIBUTE_CODE.currentHealth)
    const maxHp = p.getAttribute(ATTRIBUTE_CODE.maxHealth)
    const entry = `${p.name} ${Math.floor(hp)}/${Math.floor(maxHp)}`
    if (p.team === ParticipantSide.ALLY) allySnapshot.push(entry)
    else enemySnapshot.push(entry)
  }

  const logs: ProjectedLog[] = []
  if (allySnapshot.length > 0) {
    logs.push({
      message: `我方  ${allySnapshot.join(' · ')}`,
      segments: [
        { text: '我方  ', classStr: 'log-friendly' },
        { text: allySnapshot.join(' · ') },
      ],
      category: BATTLE_LOG_CATEGORIES.STATUS,
      meta: { role: 'snapshot' },
    })
  }
  if (enemySnapshot.length > 0) {
    logs.push({
      message: `敌方  ${enemySnapshot.join(' · ')}`,
      segments: [
        { text: '敌方  ', classStr: 'log-hostile' },
        { text: enemySnapshot.join(' · ') },
      ],
      category: BATTLE_LOG_CATEGORIES.STATUS,
      meta: { role: 'snapshot' },
    })
  }
  return logs
}

/**
 * 投影回合结束阶段标记（投影器 TODO：回合开始/结束阶段标记统一生成）。
 * 原 BattleSystem 手工 addBattleLog 迁入投影器。
 */
export function projectTurnEndLog(turn: number): ProjectedLog {
  const text = `第 ${turn} 回合结束`
  return {
    message: text,
    segments: [{ text, classStr: 'log-system' }],
    category: BATTLE_LOG_CATEGORIES.SYSTEM,
    meta: { role: 'sub' },
  }
}

