/**
 * passive-skill-categories.ts — 被动技能分类的展示配置与分组算法（单一来源）
 *
 * EnemyDetail（图鉴卡片）与 BattleDashboard（战斗面板）共用同一套分类键序/中文标签/优先级；
 * 分类色板两边语义不同（图鉴用 tokens --cat-*，战斗面板用专属 hex），各自在组件内维护。
 */

export interface PassiveCategoryMeta {
  label: string
  priority: number
}

/** 被动分类展示配置：优先级从高到低（键序即分类清单） */
export const PASSIVE_CATEGORY_CONFIG: Record<string, PassiveCategoryMeta> = {
  aura: { label: '光环', priority: 0 },
  trigger: { label: '触发', priority: 1 },
  heal: { label: '治疗', priority: 2 },
  immunity: { label: '免疫', priority: 3 },
  summon: { label: '召唤', priority: 4 },
  dot: { label: '持续', priority: 5 },
  shield: { label: '护盾', priority: 6 },
  attribute: { label: '属性', priority: 7 },
}

/** 未配置/未知分类的兜底组 */
export const PASSIVE_UNCATEGORIZED = { category: '__uncategorized__', label: '未分类', priority: 99 } as const

export interface PassiveSkillGroup<T> {
  category: string
  label: string
  priority: number
  skills: T[]
}

/** 按首个 passiveCategory 分组（未配置/未知分类入「未分类」），组内保序，组间按 priority 升序 */
export function groupPassiveSkills<T>(
  passives: readonly T[],
  getCategories: (skill: T) => string[] | undefined,
): PassiveSkillGroup<T>[] {
  const groups = new Map<string, PassiveSkillGroup<T>>()
  for (const skill of passives) {
    // 取首个分类为主分类，避免重复展示
    const primary = getCategories(skill)?.[0]
    const cat = primary && PASSIVE_CATEGORY_CONFIG[primary] ? primary : PASSIVE_UNCATEGORIZED.category
    if (!groups.has(cat)) {
      const cfg = cat === PASSIVE_UNCATEGORIZED.category ? PASSIVE_UNCATEGORIZED : PASSIVE_CATEGORY_CONFIG[cat]
      groups.set(cat, { category: cat, label: cfg.label, priority: cfg.priority, skills: [] })
    }
    groups.get(cat)!.skills.push(skill)
  }
  return [...groups.values()].sort((a, b) => a.priority - b.priority)
}
