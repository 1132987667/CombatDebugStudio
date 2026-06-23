export class Speed {
  private constructor(readonly value: number) {}

  static create(value: number): Speed {
    return new Speed(Math.max(1, Math.round(value)))
  }

  toNumber(): number {
    return this.value
  }

  compareTo(other: Speed): number {
    return this.value - other.value
  }

  isGreaterThan(other: Speed): boolean {
    return this.value > other.value
  }
}
