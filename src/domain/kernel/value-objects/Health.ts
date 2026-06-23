export class Health {
  private constructor(readonly value: number) {}

  static create(value: number, max: number): Health {
    const clamped = Math.max(0, Math.min(Math.round(value), max))
    return new Health(clamped)
  }

  static zero(): Health {
    return new Health(0)
  }

  isZero(): boolean {
    return this.value === 0
  }

  isMax(max: number): boolean {
    return this.value >= max
  }

  add(amount: number, max: number): Health {
    return Health.create(this.value + amount, max)
  }

  subtract(amount: number): Health {
    return Health.create(this.value - amount, this.value)
  }

  toNumber(): number {
    return this.value
  }
}
