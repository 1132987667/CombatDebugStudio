/**
 * affix-rule-defaults.ts — 词条投放规则定稿的唯一读取口（configs/equipment/affix-rule.json）
 *
 * NOTE: 种子（seed.ts）与「词条投放规则」页必须共用此函数。此前页面手抄了一份 ~128 行默认值，
 * 改 configs 后两处各自漂移，策划在页面上看到的仍是旧快照（武器含锤、剑系数 0.85）。
 * 每次数值定稿只改 JSON 一处即可。
 */

import type { AffixRuleConfig } from '@/domain/fengshen/types'
import affixRuleJson from '@configs/equipment/affix-rule.json'

export function affixRuleDefaults(): AffixRuleConfig {
  // 深拷贝：JSON 模块导入是共享单例，浅展开只复制顶层，嵌套对象被就地编辑会污染源数据
  return structuredClone({ id: 'affix_rule', ...affixRuleJson }) as AffixRuleConfig
}
