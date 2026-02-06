# 游戏数值计算系统AI实现提示词

## 任务概述

请基于以下要求，实现游戏中DAMAGE类型step和HEAL类型step的伤害/治疗计算逻辑。本提示词旨在提供清晰的技术指导，确保AI能够准确理解并实现复杂的数值计算系统。

---

## 一、数据结构定义

### 1.1 基础伤害/治疗数据结构

```typescript
/**
 * 伤害/治疗计算配置接口
 */
interface DamageHealCalculationConfig {
  /**
   * 基础值
   * 作为伤害/治疗计算的基础数值
   */
  baseValue: number;
  
  /**
   * 额外值列表
   * 由多个(关联属性, 比率)键值对组成的数组
   */
  extraValues: Array<{
    /**
     * 关联属性名称
     * 如：'attack'、'defense'、'magicPower'等
     */
    attribute: string;
    
    /**
     * 比率系数
     * 关联属性乘以该比率后加入最终计算
     */
    ratio: number;
  }>;
  
  /**
   * 攻击类型（仅DAMAGE类型使用）
   */
  attackType?: 'normal' | 'magic' | 'physical' | 'true';
  
  /**
   * 是否为单回合效果（仅HEAL类型使用）
   */
  isSingleTurn?: boolean;
}
```

### 1.2 技能步骤扩展接口

```typescript
/**
 * 扩展的SkillStep接口（DAMAGE/HEAL类型专用）
 */
interface ExtendedSkillStep extends SkillStep {
  /**
   * 伤害/治疗计算配置
   * 当type为DAMAGE或HEAL时必填
   */
  calculation?: DamageHealCalculationConfig;
  
  /**
   * 目标属性修正（可选）
   * 对目标特定属性的修正系数
   */
  targetModifiers?: Record<string, number>;
  
  /**
   * 暴击配置（可选）
   */
  criticalConfig?: {
    rate: number;      // 暴击率
    multiplier: number; // 暴击倍率
  };
}
```

---

## 二、计算公式系统

### 2.1 核心计算公式

**最终伤害/治疗值 = 基础值 + Σ(关联属性 × 比率)**

#### 详细计算流程：

```typescript
function calculateDamageHealValue(
  config: DamageHealCalculationConfig,
  source: BattleParticipant,  // 施放者
  target: BattleParticipant,  // 目标
  step: ExtendedSkillStep     // 技能步骤
): number {
  // 1. 基础值
  let result = config.baseValue;
  
  // 2. 额外值计算
  config.extraValues.forEach(extra => {
    const attributeValue = source.getAttribute(extra.attribute);
    result += attributeValue * extra.ratio;
  });
  
  // 3. 目标属性修正
  if (step.targetModifiers) {
    Object.entries(step.targetModifiers).forEach(([attr, modifier]) => {
      const targetAttrValue = target.getAttribute(attr);
      result *= (1 + modifier * targetAttrValue / 100);
    });
  }
  
  // 4. 暴击判定（仅DAMAGE类型）
  if (step.type === 'DAMAGE' && step.criticalConfig) {
    const isCritical = Math.random() < step.criticalConfig.rate;
    if (isCritical) {
      result *= step.criticalConfig.multiplier;
    }
  }
  
  return Math.max(0, Math.floor(result)); // 确保非负整数
}
```

### 2.2 特殊规则处理

#### 2.2.1 DAMAGE类型特殊规则
- **攻击类型影响**：不同攻击类型受目标防御属性的影响不同
- **属性克制**：考虑元素属性相克关系
- **穿透效果**："true"类型伤害无视防御

#### 2.2.2 HEAL类型特殊规则
- **单回合效果**：当`isSingleTurn`为true时，治疗立即生效
- **治疗上限**：治疗量不超过目标最大生命值
- **负面状态影响**：某些debuff可能降低治疗效果

---

## 三、实现要求

### 3.1 核心功能实现

#### 3.1.1 伤害计算模块
```typescript
class DamageCalculator {
  /**
   * 计算最终伤害值
   */
  calculateDamage(
    step: ExtendedSkillStep,
    source: BattleParticipant,
    target: BattleParticipant
  ): number {
    // 实现详细伤害计算逻辑
  }
  
  /**
   * 应用伤害到目标
   */
  applyDamage(target: BattleParticipant, damage: number): void {
    // 实现伤害应用逻辑
  }
}
```

#### 3.1.2 治疗计算模块
```typescript
class HealCalculator {
  /**
   * 计算最终治疗值
   */
  calculateHeal(
    step: ExtendedSkillStep,
    source: BattleParticipant,
    target: BattleParticipant
  ): number {
    // 实现详细治疗计算逻辑
  }
  
  /**
   * 应用治疗到目标
   */
  applyHeal(target: BattleParticipant, heal: number): void {
    // 实现治疗应用逻辑
  }
}
```

### 3.2 集成到现有系统

#### 3.2.1 SkillManager集成
```typescript
class SkillManager {
  private executeDamageStep(
    skillStep: ExtendedSkillStep,
    battleAction: BattleAction,
    source: BattleParticipant,
    target: BattleParticipant
  ): void {
    const damage = this.damageCalculator.calculateDamage(skillStep, source, target);
    const actualDamage = target.takeDamage(damage);
    
    // 记录战斗动作
    battleAction.damage += actualDamage;
    battleAction.effects.push({
      type: 'damage',
      value: actualDamage,
      description: `${source.name} 造成 ${actualDamage} 伤害`
    });
  }
  
  private executeHealStep(
    skillStep: ExtendedSkillStep,
    battleAction: BattleAction,
    source: BattleParticipant,
    target: BattleParticipant
  ): void {
    const heal = this.healCalculator.calculateHeal(skillStep, source, target);
    const actualHeal = target.heal(heal);
    
    // 记录战斗动作
    battleAction.heal += actualHeal;
    battleAction.effects.push({
      type: 'heal',
      value: actualHeal,
      description: `${source.name} 恢复 ${actualHeal} 生命值`
    });
  }
}
```

---

## 四、应用场景示例

### 4.1 基础伤害技能示例

```typescript
const basicAttackStep: ExtendedSkillStep = {
  type: 'DAMAGE',
  calculation: {
    baseValue: 50,
    extraValues: [
      { attribute: 'attack', ratio: 1.2 },
      { attribute: 'strength', ratio: 0.5 }
    ],
    attackType: 'physical'
  },
  criticalConfig: {
    rate: 0.1,    // 10%暴击率
    multiplier: 1.5 // 1.5倍暴击伤害
  }
};
```

### 4.2 高级治疗技能示例

```typescript
const advancedHealStep: ExtendedSkillStep = {
  type: 'HEAL',
  calculation: {
    baseValue: 100,
    extraValues: [
      { attribute: 'magicPower', ratio: 0.8 },
      { attribute: 'wisdom', ratio: 0.3 }
    ],
    isSingleTurn: true
  },
  targetModifiers: {
    'healReceived': 0.2 // 目标受治疗加成20%
  }
};
```

### 4.3 复合技能示例

```typescript
const compositeSkill: ExtendedSkillStep[] = [
  {
    type: 'DAMAGE',
    calculation: {
      baseValue: 80,
      extraValues: [{ attribute: 'attack', ratio: 1.0 }],
      attackType: 'magic'
    }
  },
  {
    type: 'HEAL',
    calculation: {
      baseValue: 40,
      extraValues: [{ attribute: 'magicPower', ratio: 0.5 }],
      isSingleTurn: true
    }
  }
];
```

---

## 五、特殊情况处理规则

### 5.1 边界情况处理

1. **数值溢出保护**：所有计算结果应限制在合理范围内
2. **除零保护**：避免除零错误
3. **属性不存在**：当关联属性不存在时使用默认值
4. **目标死亡**：对已死亡目标不执行治疗/伤害

### 5.2 状态影响

1. **增益效果**：考虑施放者身上的攻击/治疗加成buff
2. **减益效果**：考虑目标身上的防御/受治疗减益debuff
3. **环境因素**：战场环境对特定类型伤害/治疗的影响

### 5.3 性能优化

1. **缓存机制**：对频繁使用的计算进行缓存
2. **批量计算**：支持批量处理多个技能步骤
3. **懒加载**：属性获取采用懒加载策略

---

## 六、预期输出格式要求

### 6.1 计算日志格式

```typescript
interface CalculationLog {
  timestamp: number;
  stepType: 'DAMAGE' | 'HEAL';
  sourceId: string;
  targetId: string;
  baseValue: number;
  extraValues: Array<{ attribute: string; value: number; ratio: number }>;
  finalValue: number;
  critical: boolean;
  modifiers: Record<string, number>;
}
```

### 6.2 错误处理格式

```typescript
interface CalculationError {
  code: string;
  message: string;
  step: ExtendedSkillStep;
  source?: BattleParticipant;
  target?: BattleParticipant;
  timestamp: number;
}
```

### 6.3 调试信息格式

```typescript
interface DebugInfo {
  calculationSteps: Array<{
    step: string;
    value: number;
    description: string;
  }>;
  finalResult: number;
  executionTime: number;
}
```

---

## 七、验证标准

### 7.1 功能验证
- [ ] 基础伤害计算正确
- [ ] 额外值计算正确
- [ ] 暴击系统正常工作
- [ ] 治疗上限有效
- [ ] 单回合治疗立即生效

### 7.2 性能验证
- [ ] 单次计算时间 < 1ms
- [ ] 内存使用合理
- [ ] 无内存泄漏

### 7.3 兼容性验证
- [ ] 与现有战斗系统集成正常
- [ ] 数据类型兼容
- [ ] 错误处理完善

---

## 总结

本提示词提供了完整的DAMAGE/HEAL类型step计算系统实现指导，涵盖数据结构设计、计算公式、特殊规则处理、应用示例等各个方面。AI应根据此提示词实现专业、高效、可靠的游戏数值计算系统，确保游戏平衡性和用户体验。

**关键要求**：
- 保持代码的可读性和可维护性
- 提供完善的错误处理和日志记录
- 支持灵活的配置和扩展
- 确保数值计算的准确性和一致性