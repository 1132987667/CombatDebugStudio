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
import { computeStatBonuses, createPlayerProfile, expNeedForLevel, playerConfig } from '@/presentation/modules/yanjie/xiyou/playerProfile'
import { schoolAttributeBonuses } from '@/presentation/modules/yanjie/xiyou/battle'
import { grantLevelPoint } from '@/presentation/modules/yanjie/xiyou/xiyouData'
import { PLAYER_ID } from '@/shared/constants/player'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'

export const usePlayerStore = defineStore('player', () => {
  /** 玩家属性（基础 + 等级成长 + 加点；血量/能量为运行时状态） */
  const player = reactive<XiyouPlayer>(createPlayerProfile({ level: 5, exp: 360 }))

  /** 角色加点（运行时状态） */
  const statPoints = reactive<XiyouStatPoints>({
    available: 3,
    strength: 0,
    vitality: 0,
    agility: 0,
    spirit: 0,
  })

  /** 玩家货币（运行时状态） */
  const currency = reactive<XiyouCurrency>({ copper: 12880, silver: 36, jade: 520 })

  /** 玩家属性值快照（实时计算：player 基础 + 等级成长 + 加点 + 流派加成；缺省走领域默认值 getAttrDv） */
  const playerAttributes = computed<Partial<Record<ATTRIBUTE_CODE, number>>>(() => {
    const bonus = computeStatBonuses(statPoints)
    const school = schoolAttributeBonuses({
      attack: player.attackMax + (bonus[ATTRIBUTE_CODE.attack] ?? 0),
      defense: player.defense + (bonus[ATTRIBUTE_CODE.defense] ?? 0),
      speed: player.speed + (bonus[ATTRIBUTE_CODE.speed] ?? 0),
      maxHp: player.maxHp + (bonus[ATTRIBUTE_CODE.maxHealth] ?? 0),
    })
    // NOTE: 基础快照只含 player 基础值 + 加点；流派增量统一由下方全键循环叠加（此前逐键
    //       withSchool 只覆盖 9 个键，lifestealRate/critResist/armorBreak 等进阶属性节点
    //       增量被丢弃，面板与战斗快照都看不到）
    const snapshot: Partial<Record<ATTRIBUTE_CODE, number>> = {
      [ATTRIBUTE_CODE.currentHealth]: player.hp,
      [ATTRIBUTE_CODE.maxHealth]: player.maxHp + (bonus[ATTRIBUTE_CODE.maxHealth] ?? 0),
      [ATTRIBUTE_CODE.currentEnergy]: player.energy,
      [ATTRIBUTE_CODE.maxEnergy]: player.maxEnergy + (bonus[ATTRIBUTE_CODE.maxEnergy] ?? 0),
      [ATTRIBUTE_CODE.attack]: player.attackMax + (bonus[ATTRIBUTE_CODE.attack] ?? 0),
      [ATTRIBUTE_CODE.defense]: player.defense + (bonus[ATTRIBUTE_CODE.defense] ?? 0),
      [ATTRIBUTE_CODE.speed]: player.speed + (bonus[ATTRIBUTE_CODE.speed] ?? 0),
      [ATTRIBUTE_CODE.critRate]: player.critRate,
      [ATTRIBUTE_CODE.critDamage]: player.critDamage,
      [ATTRIBUTE_CODE.comboRate]: playerConfig.base.comboRate ?? 0,
      [ATTRIBUTE_CODE.damageReduction]: playerConfig.base.damageReduction ?? 0,
      [ATTRIBUTE_CODE.hit]: player.hitRate,
      [ATTRIBUTE_CODE.dodge]: player.dodgeRate,
      [ATTRIBUTE_CODE.hitValue]: playerConfig.base.hitValue,
      [ATTRIBUTE_CODE.dodgeValue]: playerConfig.base.dodgeValue,
    }
    // NOTE: school 为流派属性增量（schoolAttributeBonuses 已归一为绝对增量：percent 属性
    //       已是百分点、数值属性已按基础值换算），逐键直接叠加
    for (const [attr, inc] of Object.entries(school)) {
      if (!inc) continue
      const code = attr as ATTRIBUTE_CODE
      snapshot[code] = (snapshot[code] ?? 0) + inc
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
      dodge: attr[ATTRIBUTE_CODE.dodge] ?? player.dodgeRate,
      damageReduction: attr[ATTRIBUTE_CODE.damageReduction] ?? 0,
    }
  })

  // ════════════ 经济与成长（战斗结算入口） ════════════

  /** 战斗胜利结算：金币入账（copper） */
  function gainCurrency(unit: keyof XiyouCurrency, amount: number): void {
    if (amount <= 0) return
    currency[unit] += amount
  }

  /**
   * 经验入账并处理升级：溢出经验顺延，每升一级重算属性（基础+成长+加点）、回满血能量。
   * @returns 本次升级的等级数（0 表示未升级）
   */
  function gainExp(amount: number): number {
    if (amount <= 0) return 0
    player.exp += amount
    let leveled = 0
    while (player.exp >= player.expNeed && Number.isFinite(player.expNeed)) {
      player.exp -= player.expNeed
      leveled += 1
      // 每升 1 级 +1 技能点（需求 §2.1.1，等级点上限 50）
      grantLevelPoint()
      const profile = createPlayerProfile({
        level: player.level + 1,
        exp: player.exp,
        stats: { ...statPoints },
      })
      Object.assign(player, profile)
    }
    player.expNeed = expNeedForLevel(player.level)
    return leveled
  }

  return { player, statPoints, currency, playerAttributes, battleSnapshot, gainExp, gainCurrency }
})
