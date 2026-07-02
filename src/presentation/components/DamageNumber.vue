<!--
 * 文件: DamageNumber.vue
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 伤害数字显示组件
 * 描述: 负责在战斗场景中显示动态的伤害数值，支持暴击、连击、护盾伤害等特效
 * 版本: 1.0.0
-->

<template>
  <div class="damage-number-container">
    <transition-group name="damage" tag="div" class="damage-numbers">
      <div
        v-for="damage in damages"
        :key="damage.id"
        class="damage-number"
        :class="[
          damage.type,
          damage.damageType,
          { critical: damage.isCritical, combo: damage.isCombo, shield: damage.isShieldDamage }
        ]"
        :style="{
          left: damage.x + 'px',
          top: damage.y + 'px',
          animationDuration: damage.duration + 'ms',
          animationDelay: damage.delay + 'ms'
        }"
        @animationend="removeDamage(damage.id)"
      >
        <div class="damage-content">
          <span class="damage-value">{{ damage.value }}</span>
          <span v-if="damage.damageTypeIcon" class="damage-type-icon">{{ damage.damageTypeIcon }}</span>
        </div>
      </div>
    </transition-group>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

export type DamageType = 'physical_damage' | 'elemental_damage' | 'true_damage';
export type DamageCategory = 'damage' | 'heal' | 'critical' | 'miss' | 'combo' | 'shield';

interface DamageInfo {
  id: string;
  value: string;
  type: DamageCategory;
  damageType?: DamageType;
  isCritical?: boolean;
  isCombo?: boolean;
  isShieldDamage?: boolean;
  x: number;
  y: number;
  duration: number;
  delay: number;
  damageTypeIcon?: string;
}

const props = defineProps<{
  position?: {
    x: number;
    y: number;
  };
}>();

const emit = defineEmits<{
  (e: 'damageEnd', damageId: string): void;
}>();

const damages = ref<DamageInfo[]>([]);

let damageIdCounter = 0;

const damageTypeIcons: Record<DamageType, string> = {
  physical_damage: '⚔️',
  elemental_damage: '✨',
  true_damage: '💥'
};

const damageTypeColors: Record<DamageType, string> = {
  physical_damage: '#ff6b6b',
  elemental_damage: '#9c88ff',
  true_damage: '#ffffff'
};

function addDamage(
  value: number | string, 
  type: DamageCategory = 'damage', 
  damageType: DamageType = 'physical_damage', 
  isCritical: boolean = false, 
  isCombo: boolean = false,
  isShieldDamage: boolean = false,
  position?: { x: number; y: number },
  duration: number = 1500,
  delay: number = 0
) {
  const id = `damage_${Date.now()}_${damageIdCounter++}`;
  const damageValue = typeof value === 'number' ? 
    (type === 'damage' || type === 'critical' || type === 'combo' ? `-${value}` : `+${value}`) : 
    value;
  
  damages.value.push({
    id,
    value: damageValue,
    type,
    damageType,
    isCritical,
    isCombo,
    isShieldDamage,
    x: position?.x || props.position?.x || 0,
    y: position?.y || props.position?.y || 0,
    duration,
    delay,
    damageTypeIcon: damageTypeIcons[damageType]
  });
  
  return id;
}

function removeDamage(id: string) {
  const index = damages.value.findIndex(damage => damage.id === id);
  if (index > -1) {
    damages.value.splice(index, 1);
    emit('damageEnd', id);
  }
}

function clearDamages() {
  damages.value = [];
}

defineExpose({
  addDamage,
  removeDamage,
  clearDamages
});
</script>

<style scoped>
.damage-number-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}

.damage-numbers {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.damage-number {
  position: absolute;
  font-weight: bold;
  font-size: 16px;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
  animation: damageFloat 1.5s ease-out forwards;
  white-space: nowrap;
  z-index: 1000;
}

.damage-content {
  display: flex;
  align-items: center;
  gap: 4px;
}

.damage-value {
  font-weight: bold;
}

.damage-type-icon {
  font-size: 12px;
  margin-left: 2px;
}


/* 伤害类型颜色 */
.damage-number.physical_damage { color: #ff6b6b; }
.damage-number.elemental_damage { color: #9c88ff; }
.damage-number.true_damage { color: #ffffff; }

/* 伤害类别样式 */
.damage-number.damage {
  font-weight: bold;
}

.damage-number.heal {
  color: #44ff44;
  font-weight: bold;
}

.damage-number.miss {
  color: #aaaaaa;
  font-style: italic;
}

.damage-number.combo {
  font-size: 18px;
  font-weight: bolder;
  text-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
}

.damage-number.shield {
  color: #4ecdc4;
  font-weight: bold;
  text-shadow: 0 0 6px rgba(78, 205, 196, 0.5);
}

/* 暴击效果 */
.damage-number.critical {
  font-size: 20px;
  font-weight: bolder;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.7);
}


.damage-number.critical.physical_damage { animation: criticalPhysicalFloat 1.8s ease-out forwards; }
.damage-number.critical.elemental_damage { animation: criticalElementalFloat 1.8s ease-out forwards; }
.damage-number.critical.true_damage { animation: criticalTrueFloat 1.8s ease-out forwards; }

/* 基础浮动动画 */
@keyframes damageFloat {
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  50% {
    opacity: 0.8;
    transform: translateY(-20px) scale(1.1);
  }
  100% {
    opacity: 0;
    transform: translateY(-40px) scale(1.2);
  }
}

/* 特殊类型暴击动画 */
@keyframes criticalPhysicalFloat {
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
    text-shadow: 0 0 10px #ff6b6b;
  }
  30% {
    opacity: 1;
    transform: translateY(-10px) scale(1.5);
    text-shadow: 0 0 20px #ff6b6b;
  }
  60% {
    opacity: 0.9;
    transform: translateY(-25px) scale(1.3);
    text-shadow: 0 0 15px #ff6b6b;
  }
  100% {
    opacity: 0;
    transform: translateY(-50px) scale(1.1);
    text-shadow: 0 0 5px #ff6b6b;
  }
}

@keyframes criticalElementalFloat {
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
    text-shadow: 0 0 10px #9c88ff;
  }
  30% {
    opacity: 1;
    transform: translateY(-10px) scale(1.5);
    text-shadow: 0 0 20px #9c88ff;
  }
  60% {
    opacity: 0.9;
    transform: translateY(-25px) scale(1.3);
    text-shadow: 0 0 15px #9c88ff;
  }
  100% {
    opacity: 0;
    transform: translateY(-50px) scale(1.1);
    text-shadow: 0 0 5px #9c88ff;
  }
}

@keyframes criticalTrueFloat {
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
    text-shadow: 0 0 10px #ffffff;
  }
  30% {
    opacity: 1;
    transform: translateY(-10px) scale(1.5);
    text-shadow: 0 0 20px #ffffff;
  }
  60% {
    opacity: 0.9;
    transform: translateY(-25px) scale(1.3);
    text-shadow: 0 0 15px #ffffff;
  }
  100% {
    opacity: 0;
    transform: translateY(-50px) scale(1.1);
    text-shadow: 0 0 5px #ffffff;
  }
}

/* 连击效果 */
@keyframes comboFloat {
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
    text-shadow: 0 0 10px rgba(255, 255, 255, 0.8);
  }
  50% {
    opacity: 0.9;
    transform: translateY(-25px) scale(1.3);
    text-shadow: 0 0 20px rgba(255, 255, 255, 0.9);
  }
  100% {
    opacity: 0;
    transform: translateY(-45px) scale(1.1);
    text-shadow: 0 0 5px rgba(255, 255, 255, 0.5);
  }
}

.damage-number.combo {
  animation: comboFloat 2s ease-out forwards;
}

/* 护盾伤害效果 */
@keyframes shieldFloat {
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
    text-shadow: 0 0 10px rgba(78, 205, 196, 0.5);
  }
  50% {
    opacity: 0.8;
    transform: translateY(-20px) scale(1.2);
    text-shadow: 0 0 15px rgba(78, 205, 196, 0.7);
  }
  100% {
    opacity: 0;
    transform: translateY(-35px) scale(1.1);
    text-shadow: 0 0 5px rgba(78, 205, 196, 0.3);
  }
}

.damage-number.shield {
  animation: shieldFloat 1.6s ease-out forwards;
}

.damage-enter-active,
.damage-leave-active {
  transition: all 0.3s ease;
}

.damage-enter-from,
.damage-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.8);
}
</style>