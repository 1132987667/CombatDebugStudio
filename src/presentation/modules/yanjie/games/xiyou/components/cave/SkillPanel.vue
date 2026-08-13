<template>
  <div>
    <div class="xy-cave-skill-bar">
      <span>可用技能点</span>
      <strong>{{ statPoints.available }}</strong>
    </div>

    <!-- 流派切换 -->
    <div class="xy-cave-skill-schools">
      <button
        v-for="s in schools"
        :key="s.id"
        type="button"
        class="xy-cave-skill-school"
        :class="{ active: schoolId === s.id }"
        @click="schoolId = s.id"
      >
        {{ s.name }}
      </button>
    </div>

    <div class="xy-cave-skill-grid">
      <div
        v-for="sk in currentSkills"
        :key="sk.name"
        class="xy-cave-skill-card"
        :class="cardClass(sk)"
        role="button"
        :tabindex="locked(sk) ? -1 : 0"
        :aria-disabled="locked(sk)"
        :aria-pressed="isChoosing(sk)"
        @click="choose(sk)"
        @keydown.enter="onCardEnter(sk, $event)"
      >
        <span class="xy-cave-skill-card__head">
          <span class="xy-cave-skill-card__name">{{ sk.name }}</span>
          <span class="xy-cave-skill-card__tier">
            <svg v-if="locked(sk)" viewBox="0 0 24 24" class="xy-cave-skill-lock" aria-hidden="true">
              <path d="M7 11V7a5 5 0 0 1 10 0v4M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            {{ tierText(sk) }} · {{ typeText(sk.type) }}
          </span>
        </span>
        <p class="xy-cave-skill-card__desc">{{ sk.desc }}</p>
        <span v-if="sk.cost > 0" class="xy-cave-skill-card__cost">消耗能量 {{ sk.cost }}</span>
        <span v-if="!learned(sk)" class="xy-cave-skill-card__cost">需角色等级 {{ sk.levelReq ?? 0 }}</span>
        <div v-if="isChoosing(sk)" class="xy-cave-skill-card__learn">
          <button
            type="button"
            class="xy-cave-action xy-cave-action--ghost"
            :disabled="statPoints.available <= 0"
            @click.stop="learn(sk)"
          >
            {{ statPoints.available <= 0 ? '技能点不足' : '学 习（1 技能点）' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import type { XiyouSkill } from '../../data/mock'
import { player, schools, statPoints } from '../../data/mock'

const notification = useNotificationStore()

const defaultSchool = schools.find((s) => s.selected) ?? schools[0]
const schoolId = ref(defaultSchool.id)
const learnedSet = ref<Set<string>>(new Set())
const choosingName = ref<string | null>(null)

const currentSkills = computed<XiyouSkill[]>(() => schools.find((s) => s.id === schoolId.value)?.skills ?? [])

function learned(sk: XiyouSkill): boolean {
  return learnedSet.value.has(sk.name)
}

function levelEnough(sk: XiyouSkill): boolean {
  return player.level >= (sk.levelReq ?? 0)
}

function locked(sk: XiyouSkill): boolean {
  return !learned(sk) && !levelEnough(sk)
}

function learnable(sk: XiyouSkill): boolean {
  return !learned(sk) && levelEnough(sk)
}

function cardClass(sk: XiyouSkill): Record<string, boolean> {
  return {
    'is-learned': learned(sk),
    'is-locked': locked(sk),
    'is-available': learnable(sk) && !isChoosing(sk),
    'is-choosing': isChoosing(sk),
  }
}

function isChoosing(sk: XiyouSkill): boolean {
  return learnable(sk) && choosingName.value === sk.name
}

function choose(sk: XiyouSkill): void {
  if (!learnable(sk)) return
  choosingName.value = choosingName.value === sk.name ? null : sk.name
}

/** 仅卡片自身回车响应（内层学习按钮的回车由其 click 处理，避免冒泡竞态） */
function onCardEnter(sk: XiyouSkill, e: KeyboardEvent): void {
  if (e.target !== e.currentTarget) return
  choose(sk)
}

function tierText(sk: XiyouSkill): string {
  return { 1: '一重', 2: '二重', 3: '三重' }[sk.tier ?? 1]
}

function typeText(t: XiyouSkill['type']): string {
  return { passive: '被动', skill: '小技', ultimate: '大招' }[t]
}

function learn(sk: XiyouSkill): void {
  if (statPoints.available <= 0 || !learnable(sk)) return
  statPoints.available -= 1
  learnedSet.value.add(sk.name)
  choosingName.value = null
  notification.toast(`习得「${sk.name}」，剩余技能点 ${statPoints.available}`, 'success')
}
</script>
