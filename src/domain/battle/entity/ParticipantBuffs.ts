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
  private onChange: () => void

  constructor(buffs: string[] = [], onChange: () => void = () => {}) {
    this.buffs = buffs
    this.onChange = onChange
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
      this.onChange()
    }
  }

  /**
   * 移除 Buff
   */
  removeBuff(buffInstanceId: string): void {
    const index = this.buffs.indexOf(buffInstanceId)
    if (index !== -1) {
      this.buffs.splice(index, 1)
      this.onChange()
    }
  }

  /**
   * 判断是否拥有指定 Buff
   * 存储的是实例ID（如 'buff_stun_123'），通过前缀匹配模板ID（'buff_stun'）
   * 使用 startsWith(buffId + '_') 避免子串误判（如 'stun' 不会匹配 'buff_stun' 的实例）
   * @param buffId - Buff 模板ID（如 'buff_stun'）
   */
  hasBuff(buffId: string): boolean {
    // ponytail: 存储的是实例ID (buff_stun_123)，查询的是模板ID (buff_stun)
    // 所以用前缀匹配而非 includes 子串匹配
    return this.buffs.some((id) => id === buffId || id.startsWith(buffId + '_'))
  }
}
