/**
 * regen-equipment-core.cjs — 一键重生成 configs/equipment/equipment.json 的部位固定属性（§21 核心属性标称）
 *
 * 经 vite ssrLoadModule 加载 domain 同一实现（regenEquipmentCoreStats）执行，
 * 与封神榜 UI「全量重生成」/ packStore 实例化同口径，不维护第二套公式。
 * 用法：node scripts/tools/regen-equipment-core.cjs [--write]   （缺省 dry-run 只打印统计）
 */
const path = require('node:path')

const root = path.resolve(__dirname, '..', '..')

async function main() {
  const { createServer } = require(path.join(root, 'node_modules', 'vite'))
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const mod = await server.ssrLoadModule('/scripts/tools/regen-equipment-entry.ts')
    console.log(mod.run(process.argv.includes('--write')))
  } finally {
    await server.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
