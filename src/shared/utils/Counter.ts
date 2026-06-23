/**
 * 文件: Counter.ts
 * 创建日期: 2026-02-09
 * 功能: 计数器工具类
 * 描述: 提供简单的计数功能，用于生成唯一ID等场景
 * 版本: 1.0.0
 */

export class Counter {
  private _value: number
  constructor(initialValue: number = 0) {
    this._value = initialValue
  }
  /** 当前计数值（即将分配的下一个索引） */
  get current(): number {
    return this._value
  }
  /** 返回当前值并递增 */
  next(): number {
    return this._value++
  }
  /** 重置计数器为指定值（默认0） */
  reset(value: number = 0): void {
    this._value = value
  }
}
