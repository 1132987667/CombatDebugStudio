/**
 * 文件: AttributeEngine.ts
 * 功能: 修饰符 → 模板转换工具（预留）
 * 描述: 提供 toTemplate/toTemplates 两个静态方法，
 *       将运行时 Modifier 格式转换为配置层 ModifierTemplate 格式。
 * ponytail: 当前无 src/ 代码调用，保留为工具函数供后续扩展使用。
 */
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
