/**
 * 文件: ParticipantBuffs.ts
 * 功能: 战斗参与者 Buff 管理
 * 从 BattleParticipantImpl.ts 提取，职责单一
 */

/**
 * Buff 管理类
 * 管理参与者身上的 Buff 实例 ID 列表
 */
export class ParticipantBuffs {
  private buffs: string[]
  private markDirty: () => void

  constructor(buffs: string[] = [], markDirty: () => void = () => {}) {
    this.buffs = buffs
    this.markDirty = markDirty
  }

  /**
   * 获取 buff 列表（引用，外部慎改）
   */
  getBuffList(): string[] {
    return this.buffs
  }

  /**
   * 替换 buff 列表
   */
  setBuffList(buffs: string[]): void {
    this.buffs = buffs
  }

  /**
   * 添加 Buff
   */
  addBuff(buffInstanceId: string): void {
    if (!this.buffs.includes(buffInstanceId)) {
      this.buffs.push(buffInstanceId)
      this.markDirty()
    }
  }

  /**
   * 移除 Buff
   */
  removeBuff(buffInstanceId: string): void {
    const index = this.buffs.indexOf(buffInstanceId)
    if (index !== -1) {
      this.buffs.splice(index, 1)
      this.markDirty()
    }
  }

  /**
   * 判断是否拥有指定 Buff
   */
  hasBuff(buffId: string): boolean {
    return this.buffs.some((id) => id.includes(buffId))
  }
}
