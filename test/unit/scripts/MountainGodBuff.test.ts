import { describe, it, expect, beforeEach } from 'vitest'
import { MountainGodBuff } from '@/scripts/combat/MountainGodBuff'
import { BuffContext } from '@/core/BuffContext'

describe('MountainGodBuff', () => {
  let buff: MountainGodBuff
  let context: BuffContext

  beforeEach(() => {
    buff = new MountainGodBuff()
    context = new BuffContext(
      'test_character',
      'test_buff_instance',
      {
        id: MountainGodBuff.BUFF_ID,
        name: '山神降临',
        description: 'Test description',
        duration: 30000,
        maxStacks: 1,
        cooldown: 60000,
        parameters: {
          attackBonus: 50,
          defenseBonus: 30,
          regeneration: 5,
          refreshBonus: 10
        }
      }
    )

    // Mock addModifier method
    context.addModifier = vi.fn()
    context.setVariable = vi.fn()
    context.getVariable = vi.fn().mockReturnValue(50)
    context.removeModifiers = vi.fn()
  })

  it('should apply buff effects on apply', () => {
    buff.onApply(context)

    expect(context.addModifier).toHaveBeenCalledWith('ATK', 50, 'ADDITIVE')
    expect(context.addModifier).toHaveBeenCalledWith('DEF', 30, 'ADDITIVE')
    expect(context.addModifier).toHaveBeenCalledWith('CRIT_RATE', 0.1, 'ADDITIVE')
    expect(context.setVariable).toHaveBeenCalledWith('initialAttackBonus', 50)
  })

  it('should remove buff effects on remove', () => {
    buff.onRemove(context)

    expect(context.removeModifiers).toHaveBeenCalled()
  })

  it('should handle refresh correctly', () => {
    buff.onRefresh(context)

    expect(context.addModifier).toHaveBeenCalledWith('ATK', 10, 'ADDITIVE')
  })

  it('should have correct BUFF_ID', () => {
    expect(MountainGodBuff.BUFF_ID).toBe('mountain_god')
  })
})
