/**
 * 视觉特效映射器
 *
 * 集中管理业务伤害类型 → UI 视觉表现的映射逻辑，
 * 消除 BattleField.vue 等 UI 文件中的硬编码 if-else。
 *
 * ponytail: 当前只映射 damageCategory→动画类型，
 * 后续可扩展至元素属性（ElementType）→颜色/粒子效果。
 */
import { DamageCategory, type DamageCategory as DamageCategoryType } from '@/domain/skill/types'

export const ImpactClass = {
  FIRE: 'fire',
  FROST: 'frost',
  HEAL: 'heal',
  SHIELD: 'shield'
}
export type ImpactClass = (typeof ImpactClass)[keyof typeof ImpactClass]

export interface VisualEffectConfig {
  /** 主色调（CSS 色值） */
  color: string
  /** 命中特效 CSS 类名 */
  impactClass: ImpactClass
  /** 飞行物 CSS 类名 */
  projectileClass: ImpactClass
}

/**
 * 根据伤害大类和治疗标记获取视觉配置
 * @param category 伤害大类（physical/elemental/true）
 * @param isHeal 是否为治疗（治疗覆盖其他分类）
 */
export function getVisualEffect(
  category?: DamageCategoryType | string,
  isHeal?: boolean,
): VisualEffectConfig {
  // 治疗优先
  if (isHeal) {
    return {
      color: '#4caf50',
      impactClass: ImpactClass.HEAL,
      projectileClass: ImpactClass.HEAL,
    }
  }

  switch (category) {
    case DamageCategory.PHYSICAL:
      return {
        color: '#ff6b35',
        impactClass: ImpactClass.FIRE,
        projectileClass: ImpactClass.FIRE,
      }
    case DamageCategory.ELEMENTAL:
      return {
        color: '#4cc9f0',
        impactClass: ImpactClass.FROST,
        projectileClass: ImpactClass.FROST,
      }
    case DamageCategory.TRUE:
      return {
        color: '#ffffff',
        impactClass: ImpactClass.FIRE,
        projectileClass: ImpactClass.FIRE,
      }
    default:
      return {
        color: '#ff6b35',
        impactClass: ImpactClass.FIRE,
        projectileClass: ImpactClass.FIRE,
      }
  }
}
