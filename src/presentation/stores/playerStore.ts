/**
 * playerStore.ts — 玩家运行时状态（Pinia Composition API）
 *
 * 设计要点：
 * - 玩家属性/加点/货币为运行时状态，自 mock.ts 迁移至此（mock.ts 仅保留类型与配置数据）
 * - 初始化值来自 playerProfile（configs/xiyou/player.json 配置驱动）
 * - playerAttributes 为实时计算快照（基础 + 等级成长 + 加点加成）
 */

import { computed, reactive } from 'vue'
import { defineStore } from 'pinia'
import type { XiyouCurrency, XiyouPlayer, XiyouStatPoints, ProtagonistSnapshot } from '@/presentation/modules/yanjie/xiyou/types'
import { BREAK_NODES, computePlayerBase, computeStatBonuses, createPlayerProfile, expNeedForLevel, isBreakBlocked, playerConfig } from '@/presentation/modules/yanjie/xiyou/playerProfile'
import { LAYERED_ATTR_TO_MAIN } from '@/shared/utils/attributeSync'
import { schoolAttributeBonuses, schoolTreeBonuses } from '@/presentation/modules/yanjie/xiyou/battle'
import { grantLevelPoint } from '@/presentation/modules/yanjie/xiyou/xiyouData'
import { PLAYER_ID } from '@/shared/constants/player'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'

/** 每级自由属性点（configs/xiyou/player.json freePointsPerLevel，文档 D1：每级 4 点） */
const FREE_POINTS_PER_LEVEL = playerConfig.freePointsPerLevel ?? 4

export const usePlayerStore = defineStore('player', () => {
  /** 玩家属性（基础 + 等级成长 + 加点；血量/法力为运行时状态） */
  const player = reactive<XiyouPlayer>(createPlayerProfile({ level: 5, exp: 360 }))

  /** 角色加点（SAP 六维自由点：初始点数 = 初始等级 × 每级 4 点） */
  const statPoints = reactive<XiyouStatPoints>({
    available: playerConfig.initialLevel * FREE_POINTS_PER_LEVEL,
    hp: 0,
    atk: 0,
    def: 0,
    hit: 0,
    dodge: 0,
    speed: 0,
  })

  /** 玩家货币（运行时状态；金钱 = 原铜钱12880 + 银两36×100 + 灵石520×1000 等值换算；
   *  灵韵初始 100 ≈ 5 次一阶催熟，保证新手首日能体验"种1收3"循环） */
  const currency = reactive<XiyouCurrency>({ money: 536480, xianyuan: 100 })

  /** 玩家属性值快照（实时计算：基础+等级成长（computePlayerBase）+ 加点 + 流派加成；缺省走领域默认值 getAttrDv） */
  const playerAttributes = computed<Partial<Record<ATTRIBUTE_CODE, number>>>(() => {
    // NOTE: 基础层用 computePlayerBase（纯 base+成长，不含加点）。不可读 player.attackMax 等
    //       profile 混合字段——升级重建 profile 时已把加点写进这些字段，再叠 bonus 会加点双算
    const base = computePlayerBase(player.level)
    const bonus = computeStatBonuses(statPoints)
    const b = (code: ATTRIBUTE_CODE): number => bonus[code] ?? 0
    const school = schoolAttributeBonuses({
      attack: base.attackMax + b(ATTRIBUTE_CODE.attack),
      defense: base.defense + b(ATTRIBUTE_CODE.defense),
      speed: base.speed + b(ATTRIBUTE_CODE.speed),
      maxHp: base.maxHp + b(ATTRIBUTE_CODE.maxHealth),
    })
    const snapshot: Partial<Record<ATTRIBUTE_CODE, number>> = {
      [ATTRIBUTE_CODE.currentHealth]: player.hp,
      [ATTRIBUTE_CODE.maxHealth]: base.maxHp + b(ATTRIBUTE_CODE.maxHealth),
      [ATTRIBUTE_CODE.currentEnergy]: player.energy,
      [ATTRIBUTE_CODE.maxEnergy]: base.maxEnergy + b(ATTRIBUTE_CODE.maxEnergy),
      [ATTRIBUTE_CODE.attack]: base.attackMax + b(ATTRIBUTE_CODE.attack),
      [ATTRIBUTE_CODE.defense]: base.defense + b(ATTRIBUTE_CODE.defense),
      [ATTRIBUTE_CODE.speed]: base.speed + b(ATTRIBUTE_CODE.speed),
      [ATTRIBUTE_CODE.critRate]: base.critRate,
      [ATTRIBUTE_CODE.critDamage]: base.critDamage,
      [ATTRIBUTE_CODE.comboRate]: playerConfig.base.comboRate ?? 0,
      [ATTRIBUTE_CODE.damageReduction]: playerConfig.base.damageReduction ?? 0,
      [ATTRIBUTE_CODE.hitRate]: base.hitRate,
      [ATTRIBUTE_CODE.dodgeRate]: base.dodgeRate,
      [ATTRIBUTE_CODE.hitValue]: base.hitValue + b(ATTRIBUTE_CODE.hitValue),
      [ATTRIBUTE_CODE.dodgeValue]: base.dodgeValue + b(ATTRIBUTE_CODE.dodgeValue),
    }
    // NOTE: school 为流派属性增量（schoolAttributeBonuses 已归一为绝对增量：percent 属性
    //       已是百分点、数值属性已按基础值换算），逐键直接叠加
    for (const [attr, inc] of Object.entries(school)) {
      if (!inc) continue
      const code = attr as ATTRIBUTE_CODE
      snapshot[code] = (snapshot[code] ?? 0) + inc
    }
    // NOTE: 流派树按四层模型分层（《属性监控显示设计.md》）：绝对值节点入 L1 直加；
    //       加成/系数节点按主属性分别进 L2/L3 乘区——多个乘区单独相乘，禁止折算合并
    const treeBonusByMain: Record<string, number> = {}
    const treeCoefByMain: Record<string, number> = {}
    for (const [attr, inc] of Object.entries(schoolTreeBonuses())) {
      if (!inc) continue
      const layered = LAYERED_ATTR_TO_MAIN[attr as ATTRIBUTE_CODE]
      if (layered) {
        const bucket = layered.layer === 'bonus' ? treeBonusByMain : treeCoefByMain
        bucket[layered.main] = (bucket[layered.main] ?? 0) + inc
        continue
      }
      const code = attr as ATTRIBUTE_CODE
      snapshot[code] = (snapshot[code] ?? 0) + inc
    }
    const layeredMains = new Set([...Object.keys(treeBonusByMain), ...Object.keys(treeCoefByMain)])
    for (const main of layeredMains) {
      const code = main as ATTRIBUTE_CODE
      const cur = snapshot[code] ?? 0
      snapshot[code] = Math.round(cur * (1 + (treeBonusByMain[main] ?? 0) / 100) * (1 + (treeCoefByMain[main] ?? 0) / 100))
    }
    return snapshot
  })

  /** 主角实时战斗快照（战斗主角属性权威：加点/丹药/流派/等级变化反映到战斗；数值取 playerAttributes 含加成） */
  const battleSnapshot = computed<ProtagonistSnapshot>(() => {
    const attr = playerAttributes.value
    return {
      id: PLAYER_ID,
      name: player.name,
      level: player.level,
      hp: player.hp,
      maxHp: attr[ATTRIBUTE_CODE.maxHealth] ?? player.maxHp,
      energy: player.energy,
      maxEnergy: attr[ATTRIBUTE_CODE.maxEnergy] ?? player.maxEnergy,
      speed: attr[ATTRIBUTE_CODE.speed] ?? player.speed,
      attack: attr[ATTRIBUTE_CODE.attack] ?? player.attackMax,
      defense: attr[ATTRIBUTE_CODE.defense] ?? player.defense,
      side: 'player',
      critRate: attr[ATTRIBUTE_CODE.critRate] ?? player.critRate,
      critDamage: attr[ATTRIBUTE_CODE.critDamage] ?? player.critDamage,
      dodge: attr[ATTRIBUTE_CODE.dodgeRate] ?? player.dodgeRate,
      damageReduction: attr[ATTRIBUTE_CODE.damageReduction] ?? 0,
      hitValue: attr[ATTRIBUTE_CODE.hitValue] ?? player.hitValue,
      dodgeValue: attr[ATTRIBUTE_CODE.dodgeValue] ?? player.dodgeValue,
    }
  })

  // ════════════ 经济与成长（战斗结算入口） ════════════

  /** 战斗胜利结算：金钱入账（money） */
  function gainCurrency(unit: keyof XiyouCurrency, amount: number): void {
    if (amount <= 0) return
    currency[unit] += amount
  }

  /**
   * 经验入账并处理升级：溢出经验顺延，每升一级重算属性（基础+成长+加点）、回满血法力。
   * @returns 本次升级的等级数（0 表示未升级）
   */
  function gainExp(amount: number): number {
    if (amount <= 0) return 0
    player.exp += amount
    let leveled = 0
    while (player.exp >= player.expNeed && Number.isFinite(player.expNeed)) {
      const nextLevel = player.level + 1
      // 等级突破节点（§20）：10 的倍数级需对应阶突破丹+金钱解锁，未突破则经验封存卡级
      if (isBreakBlocked(nextLevel, player.breakStage)) break
      player.exp -= player.expNeed
      leveled += 1
      // 每升 1 级 +1 技能点（需求 §2.1.1，等级点上限 50）、+4 自由属性点（文档 D1）
      grantLevelPoint()
      statPoints.available += FREE_POINTS_PER_LEVEL
      const profile = createPlayerProfile({
        level: nextLevel,
        exp: player.exp,
        stats: { ...statPoints },
        breakStage: player.breakStage,
      })
      Object.assign(player, profile)
    }
    player.expNeed = expNeedForLevel(player.level)
    return leveled
  }

  /**
   * 突破当前节点（§20）：阶次 +1，解锁下一个 10 的倍数级。
   * 丹药扣减与金钱校验由调用方（角色面板）完成——playerStore 不反向依赖 packStore。
   */
  function setBreakStage(stage: number): void {
    if (stage <= player.breakStage || stage > BREAK_NODES.length) return
    player.breakStage = stage
  }

  return { player, statPoints, currency, playerAttributes, battleSnapshot, gainExp, gainCurrency, setBreakStage }
})
