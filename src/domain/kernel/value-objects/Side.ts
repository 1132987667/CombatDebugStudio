export class Side {
  private constructor(readonly value: string) {}

  static readonly ALLY = new Side('ally')
  static readonly ENEMY = new Side('enemy')

  static from(value: string): Side {
    switch (value) {
      case 'ally': return Side.ALLY
      case 'enemy': return Side.ENEMY
      default: throw new Error(`Invalid side: ${value}`)
    }
  }

  isAlly(): boolean {
    return this.value === 'ally'
  }

  isEnemy(): boolean {
    return this.value === 'enemy'
  }

  opposite(): Side {
    return this.isAlly() ? Side.ENEMY : Side.ALLY
  }

  toString(): string {
    return this.value
  }
}
