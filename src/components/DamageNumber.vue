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

export type DamageType = 'physical' | 'magic' | 'fire' | 'ice' | 'lightning' | 'poison' | 'holy' | 'dark';
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
  physical: '⚔️',
  magic: '✨',
  fire: '🔥',
  ice: '❄️',
  lightning: '⚡',
  poison: '☠️',
  holy: '✨',
  dark: '💀'
};

const damageTypeColors: Record<DamageType, string> = {
  physical: '#ff6b6b',
  magic: '#9c88ff',
  fire: '#ff7b25',
  ice: '#74b9ff',
  lightning: '#feca57',
  poison: '#a29bfe',
  holy: '#fdcb6e',
  dark: '#6c5ce7'
};

function addDamage(
  value: number | string, 
  type: DamageCategory = 'damage', 
  damageType: DamageType = 'physical', 
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
.damage-number.physical { color: #ff6b6b; }
.damage-number.magic { color: #9c88ff; }
.damage-number.fire { color: #ff7b25; }
.damage-number.ice { color: #74b9ff; }
.damage-number.lightning { color: #feca57; }
.damage-number.poison { color: #a29bfe; }
.damage-number.holy { color: #fdcb6e; }
.damage-number.dark { color: #6c5ce7; }

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

.damage-number.critical.physical { animation: criticalPhysicalFloat 1.8s ease-out forwards; }
.damage-number.critical.magic { animation: criticalMagicFloat 1.8s ease-out forwards; }
.damage-number.critical.fire { animation: criticalFireFloat 1.8s ease-out forwards; }
.damage-number.critical.ice { animation: criticalIceFloat 1.8s ease-out forwards; }
.damage-number.critical.lightning { animation: criticalLightningFloat 1.8s ease-out forwards; }

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

@keyframes criticalMagicFloat {
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

@keyframes criticalFireFloat {
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
    text-shadow: 0 0 10px #ff7b25;
  }
  30% {
    opacity: 1;
    transform: translateY(-10px) scale(1.5);
    text-shadow: 0 0 20px #ff7b25;
  }
  60% {
    opacity: 0.9;
    transform: translateY(-25px) scale(1.3);
    text-shadow: 0 0 15px #ff7b25;
  }
  100% {
    opacity: 0;
    transform: translateY(-50px) scale(1.1);
    text-shadow: 0 0 5px #ff7b25;
  }
}

@keyframes criticalIceFloat {
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
    text-shadow: 0 0 10px #74b9ff;
  }
  30% {
    opacity: 1;
    transform: translateY(-10px) scale(1.5);
    text-shadow: 0 0 20px #74b9ff;
  }
  60% {
    opacity: 0.9;
    transform: translateY(-25px) scale(1.3);
    text-shadow: 0 0 15px #74b9ff;
  }
  100% {
    opacity: 0;
    transform: translateY(-50px) scale(1.1);
    text-shadow: 0 0 5px #74b9ff;
  }
}

@keyframes criticalLightningFloat {
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
    text-shadow: 0 0 10px #feca57;
  }
  30% {
    opacity: 1;
    transform: translateY(-10px) scale(1.5);
    text-shadow: 0 0 20px #feca57;
  }
  60% {
    opacity: 0.9;
    transform: translateY(-25px) scale(1.3);
    text-shadow: 0 0 15px #feca57;
  }
  100% {
    opacity: 0;
    transform: translateY(-50px) scale(1.1);
    text-shadow: 0 0 5px #feca57;
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