/**
 * 文件: TurnManager.ts
 * 创建日期: 2026-02-09
 * 功能: 回合管理器
 * 描述: 负责管理战斗回合的初始化、推进和查询，实现了ITurnManager接口，处理回合顺序和回合计数
 */

import type { BattleEntity } from '@/domain/battle/type/types'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import type { SeededRandom } from '@/shared/utils/SeededRandom'

/**
 * 回合管理器类
 * 负责管理战斗回合的初始化、推进和查询
 * 是回合数据的唯一数据源
 * 推荐通过容器注入使用
 */
export class TurnManager {
  private buffSystem: BuffSystem

  /**
   * 私有构造函数
   * @param buffSystem Buff系统实例（通过构造函数注入）
   */
  constructor(buffSystem: BuffSystem) {
    this.buffSystem = buffSystem
  }

  /**
   * 根据参与者有效速度创建回合顺序
   * 速度高的参与者排在前面，相同速度时随机排序（走 rng，未注入时回退 Math.random）
   * @param participants 参与者数组
   * @param rng 确定性随机源（战斗路径由 BattleSystem 传入 battleData.rng）
   * @param speedFirst 是否按速度优先（false=按注册顺序固定出手，对应规则开关 speedFirst）
   * @returns 按速度排序的参与者ID数组
   */
  public createTurnOrder(
    participants: BattleEntity[],
    rng?: SeededRandom,
    speedFirst: boolean = true,
  ): string[] {
    const alive = participants.filter((p) => p.isAlive())
    if (!speedFirst) return alive.map((p) => p.id)
    // 随机键先取后排（Schwartzian transform）：比较器必须自洽。
    // 旧实现在比较器内掷硬币——同一对元素两次比较可返回相反结果，
    // 既不是均匀洗牌，RNG 消耗次数还依赖 V8 sort 实现，同 seed 回放跨环境不可复现
    const keyed = alive.map((p) => ({
      id: p.id,
      speed: this.calculateEffectiveSpeed(p),
      coin: rng ? rng.nextBoolean() : Math.random() < 0.5,
    }))
    keyed.sort((a, b) => {
      if (a.speed !== b.speed) return b.speed - a.speed
      // 同速度同硬币结果保持注册顺序（ES2019 sort 稳定），行为确定性可复现
      return a.coin === b.coin ? 0 : a.coin ? -1 : 1
    })
    return keyed.map((k) => k.id)
  }

  /**
   * 计算考虑 Buff 修饰符后的实际速度
   * @param participant 参与者
   * @returns 考虑所有修饰符后的实际速度值
   */
  public calculateEffectiveSpeed(participant: BattleEntity): number {
    // 【脏标记流控】直接使用参与者的属性缓存系统，确保读取的是最新计算结果
    return participant.getAttribute(ATTRIBUTE_CODE.speed)
  }
}
