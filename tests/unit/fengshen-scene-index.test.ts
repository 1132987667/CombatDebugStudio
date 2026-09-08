/**
 * sceneIndex 纯函数测试（AGENTS.md：非琐碎逻辑必须留可运行检查）
 *
 * 覆盖：普通敌人 enemies[].id、守护者 yaotu.id、空 id 跳过、
 *       同敌人多场景后写覆盖（HACK 天花板）、空输入、筛选端匹配语义；
 *       区域索引：regionId 直读、缺 regionId 不入索引、敌人区域筛选两跳匹配（对齐 ListView）。
 *
 * 运行: npx vitest run tests/unit/fengshen-scene-index.test.ts
 */
import { describe, it, expect } from 'vitest'
import { buildEnemySceneIndex, buildSceneRegionIndex } from '@/domain/fengshen/sceneIndex'

describe('buildEnemySceneIndex', () => {
  it('普通敌人与守护者（yaotu）都映射到所属场景', () => {
    const index = buildEnemySceneIndex([
      {
        id: 'scene_1_1',
        enemies: [{ id: 'enemy_a' }, { id: 'enemy_b' }],
        yaotu: { id: 'enemy_g' },
      },
    ])
    expect(index.get('enemy_a')).toBe('scene_1_1')
    expect(index.get('enemy_b')).toBe('scene_1_1')
    expect(index.get('enemy_g')).toBe('scene_1_1')
  })

  it('空/缺 id 的敌人与场景跳过，不产生空键', () => {
    const index = buildEnemySceneIndex([
      { id: 'scene_1', enemies: [{}, { id: '' }, undefined], yaotu: {} },
      { enemies: [{ id: 'enemy_x' }] },
    ])
    expect(index.size).toBe(0)
    expect(index.has('')).toBe(false)
  })

  it('同敌人在多场景出现：后写覆盖（当前数据无跨场景复用，见 sceneIndex.ts HACK）', () => {
    const index = buildEnemySceneIndex([
      { id: 'scene_1', enemies: [{ id: 'enemy_a' }] },
      { id: 'scene_2', enemies: [{ id: 'enemy_a' }] },
    ])
    expect(index.get('enemy_a')).toBe('scene_2')
  })

  it('空输入 / 无敌人场景返回空索引', () => {
    expect(buildEnemySceneIndex([]).size).toBe(0)
    expect(buildEnemySceneIndex([{ id: 'scene_1', enemies: [] }]).size).toBe(0)
  })

  it('筛选端匹配语义：选中场景仅保留归属该场景的敌人（对齐 ListView 过滤）', () => {
    const index = buildEnemySceneIndex([
      { id: 'scene_1', enemies: [{ id: 'enemy_a' }], yaotu: { id: 'enemy_g' } },
      { id: 'scene_2', enemies: [{ id: 'enemy_b' }] },
    ])
    const rows = [{ id: 'enemy_a' }, { id: 'enemy_b' }, { id: 'enemy_g' }, { id: 'boss_free' }]
    const picked = rows.filter((r) => index.get(String(r.id)) === 'scene_1')
    expect(picked.map((r) => r.id)).toEqual(['enemy_a', 'enemy_g'])
  })
})

describe('buildSceneRegionIndex', () => {
  it('场景→区域按 regionId 直读映射', () => {
    const index = buildSceneRegionIndex([
      { id: 'scene_1_1', regionId: 'region_1' },
      { id: 'scene_2_1', regionId: 'region_2' },
    ])
    expect(index.get('scene_1_1')).toBe('region_1')
    expect(index.get('scene_2_1')).toBe('region_2')
  })

  it('缺/空 regionId 或缺 id 的场景不入索引', () => {
    const index = buildSceneRegionIndex([
      { id: 'scene_x' },
      { id: 'scene_y', regionId: '' },
      { id: '', regionId: 'region_1' },
      { regionId: 'region_1' },
    ])
    expect(index.size).toBe(0)
  })

  it('空输入返回空索引', () => {
    expect(buildSceneRegionIndex([]).size).toBe(0)
  })

  it('敌人区域筛选两跳语义：敌人→场景→区域（对齐 ListView 过滤），未挂场景的敌人选任何区域都不命中', () => {
    const enemyScene = buildEnemySceneIndex([
      { id: 'scene_1', regionId: 'region_1', enemies: [{ id: 'enemy_a' }] },
      { id: 'scene_2', regionId: 'region_2', enemies: [{ id: 'enemy_b' }], yaotu: { id: 'enemy_g' } },
    ])
    const sceneRegion = buildSceneRegionIndex([
      { id: 'scene_1', regionId: 'region_1' },
      { id: 'scene_2', regionId: 'region_2' },
    ])
    const rows = [{ id: 'enemy_a' }, { id: 'enemy_b' }, { id: 'enemy_g' }, { id: 'boss_free' }]
    const byRegion = (region: string) =>
      rows.filter((r) => {
        const sceneId = enemyScene.get(String(r.id))
        return sceneId !== undefined && sceneRegion.get(sceneId) === region
      })
    expect(byRegion('region_1').map((r) => r.id)).toEqual(['enemy_a'])
    expect(byRegion('region_2').map((r) => r.id)).toEqual(['enemy_b', 'enemy_g'])
    expect(byRegion('region_3')).toEqual([])
  })

  it('联动收敛语义：已选区域下仅保留该区域场景，未选区域（空串）保留全部（对齐 groupedSceneOptions 过滤）', () => {
    const sceneRegion = buildSceneRegionIndex([
      { id: 'scene_1', regionId: 'region_1' },
      { id: 'scene_2', regionId: 'region_2' },
      { id: 'scene_3', regionId: 'region_1' },
    ])
    const options = [
      { id: 'scene_1', name: '桃林小径' },
      { id: 'scene_2', name: '古渡口' },
      { id: 'scene_3', name: '落英坡' },
    ]
    const pick = (pickedRegion: string) => options.filter((o) => !pickedRegion || sceneRegion.get(o.id) === pickedRegion)
    expect(pick('region_1').map((o) => o.id)).toEqual(['scene_1', 'scene_3'])
    expect(pick('').map((o) => o.id)).toEqual(['scene_1', 'scene_2', 'scene_3'])
  })
})
