/**
 * regen-equipment-entry.ts — regen-equipment-core.cjs 的执行入口（vite ssrLoadModule 加载）
 *
 * 与封神榜 UI「全量重生成固定属性」（EquipGeneratorView）共用 domain 同一实现
 * regenEquipmentCoreStats，约束三件套同 packStore（affixRuleDefaults + buildEquipFormula/buildPlayerConfig），
 * 不维护第二套公式。
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import equipmentJson from '@configs/equipment/equipment.json'
import { regenEquipmentCoreStats } from '@/domain/fengshen/equip-generator'
import { affixRuleDefaults } from '@/domain/fengshen/affix-rule-defaults'
import { buildEquipFormula, buildPlayerConfig } from '@/infrastructure/adapters/storage/seed'
import type { AffixRuleConfig, EquipmentData, EquipFormulaConfig } from '@/domain/fengshen/types'

/** 执行重生成；write=true 时写回 configs/equipment/equipment.json，返回统计摘要文本 */
export function run(write: boolean): string {
  const items = equipmentJson as EquipmentData[]
  const report = regenEquipmentCoreStats(items, {
    affixRule: affixRuleDefaults() as AffixRuleConfig,
    formula: buildEquipFormula().data as unknown as EquipFormulaConfig,
    conversion: (buildPlayerConfig().data as unknown as { conversion: Record<string, number> }).conversion,
  })
  const okCount = report.entries.filter((e) => e.core).length
  const lines = [
    `重生成 ${items.length} 件，写入固定属性 ${okCount} 件，缺口/兜底提示 ${report.warnings.length} 条`,
    `标称核心属性 SAP 总量：${report.sapTotal}`,
    ...report.warnings.map((w) => `  - ${w}`),
  ]
  if (write) {
    writeFileSync(fileURLToPath(new URL('../../configs/equipment/equipment.json', import.meta.url)), `${JSON.stringify(report.items, null, 2)}\n`)
    lines.push('已写回 configs/equipment/equipment.json')
  } else {
    lines.push('（dry-run，未写文件；加 --write 生效）')
  }
  return lines.join('\n')
}
