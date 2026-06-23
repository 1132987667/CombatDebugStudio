export class Energy {
  private constructor(readonly value: number) {}

  static create(value: number, max: number): Energy {
    const clamped = Math.max(0, Math.min(Math.round(value), max))
    return new Energy(clamped)
  }

  static zero(): Energy {
    return new Energy(0)
  }

  isMax(max: number): boolean {
    return this.value >= max
  }

  add(amount: number, max: number): Energy {
    return Energy.create(this.value + amount, max)
  }

  subtract(amount: number): Energy {
    return Energy.create(this.value - amount, this.value)
  }

  toNumber(): number {
    return this.value
  }
}
