import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'
import type { ModifierTemplate } from '@/domain/attribute/modifier-template'
import type { ModifierSourceType } from '@/domain/attribute/types'

export class AttributeEngine {

  static toTemplate(
    modifier: {
      buffInstanceId: string
      attribute: ATTRIBUTE_CODE
      value: number
      type: ModifierType
    },
    sourceName: string,
    sourceType: ModifierSourceType = 'buff',
  ): ModifierTemplate {
    return {
      id: modifier.buffInstanceId,
      sourceName,
      sourceType,
      targetAttribute: modifier.attribute,
      type: modifier.type,
      value: modifier.value,
    }
  }

  static toTemplates(
    modifiers: Array<{
      buffInstanceId: string
      attribute: ATTRIBUTE_CODE
      value: number
      type: ModifierType
    }>,
    getSourceName: (id: string) => string,
    getSourceType: (id: string) => ModifierSourceType,
  ): ModifierTemplate[] {
    return modifiers.map((mod) =>
      this.toTemplate(
        mod,
        getSourceName(mod.buffInstanceId),
        getSourceType(mod.buffInstanceId),
      ),
    )
  }
}

