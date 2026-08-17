import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Icons from 'unplugin-icons/vite'
import { FileSystemIconLoader } from 'unplugin-icons/loaders'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // NOTE: 本地 SVG 图标统一经 unplugin-icons 按需编译为 Vue 组件（~icons/app/*），
    //       禁止在模板/脚本中手写 SVG 代码；图标文件存放于 src/presentation/assets/icons/
    Icons({
      compiler: 'vue3',
      customCollections: {
        app: FileSystemIconLoader('src/presentation/assets/icons'),
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@configs': resolve(__dirname, 'configs'),
      '@tests': resolve(__dirname, 'tests'),
    },
  },
  build: {
    outDir: 'build/dist',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'build'],
    globals: true,
    setupFiles: ['tests/setup.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
})
