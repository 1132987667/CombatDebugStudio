/**
 * sceneIndex.ts — 敌人→场景反向索引（纯函数，可测）
 *
 * 敌人记录上没有 sceneId 字段：场景归属反向持有——scenes.enemies[].id（普通敌人）
 * 与 scenes.yaotu.id（守护者）引用 enemies 表。敌人列表按场景筛选（封神榜
 * ListView 的 sceneId 筛选）因此只能反向构建 enemyId → sceneId 字典。
 *
 * HACK 天花板：当前数据中敌人至多归属一个场景（configs 全量校验 0 例跨场景复用），
 * 字典取 Map 一对一、同 id 后写覆盖（与 refNames.buildNameIndex 同约定）。
 * 若未来允许敌人跨场景复用，升级为 Map<string, Set<string>>，筛选端从「相等」改「包含」。
 */

/** scenes 表行中与本索引相关的形状（宽松结构，多余字段忽略） */
export interface SceneRowLike {
  id?: unknown
  regionId?: unknown
  enemies?: ReadonlyArray<{ id?: unknown } | undefined> | undefined
  yaotu?: { id?: unknown } | undefined
}

/** enemyId → sceneId（覆盖普通敌人 enemies[].id 与守护者 yaotu.id；空 id 跳过） */
export function buildEnemySceneIndex(scenes: ReadonlyArray<SceneRowLike>): Map<string, string> {
  const index = new Map<string, string>()
  for (const scene of scenes) {
    if (scene.id === undefined || scene.id === null) continue
    const sceneId = String(scene.id)
    if (!sceneId) continue
    for (const enemy of scene.enemies ?? []) {
      const enemyId = enemy?.id === undefined || enemy?.id === null ? '' : String(enemy.id)
      if (enemyId) index.set(enemyId, sceneId)
    }
    const yaotuId = scene.yaotu?.id === undefined || scene.yaotu?.id === null ? '' : String(scene.yaotu.id)
    if (yaotuId) index.set(yaotuId, sceneId)
  }
  return index
}

/**
 * sceneId → regionId 索引（scenes.regionId 直读；敌人区域筛选 = 敌人索引→场景索引 复合两跳）。
 * 缺 regionId 的场景不入索引（筛选端视为「无区域」，选任何区域都不命中，与数据事实一致）。
 */
export function buildSceneRegionIndex(scenes: ReadonlyArray<SceneRowLike>): Map<string, string> {
  const index = new Map<string, string>()
  for (const scene of scenes) {
    if (scene.id === undefined || scene.id === null) continue
    const sceneId = String(scene.id)
    const regionId = scene.regionId === undefined || scene.regionId === null ? '' : String(scene.regionId)
    if (sceneId && regionId) index.set(sceneId, regionId)
  }
  return index
}
