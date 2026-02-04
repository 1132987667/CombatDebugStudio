import js from '@eslint/js'
import ts from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import vuePlugin from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import globals from 'globals'

export default [
  {
    files: ['**/*.{js,ts,vue}'],
    ignores: ['node_modules', 'build', 'dist', 'coverage'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        extraFileExtensions: ['.vue']
      },
      globals: {
        ...globals.browser, // 添加浏览器全局变量
        ...globals.node // 添加Node.js全局变量
      }
    },
    plugins: {
      '@typescript-eslint': ts,
      vue: vuePlugin
    },
    rules: {
      ...js.configs.recommended.rules,
      ...ts.configs.recommended.rules,
      ...vuePlugin.configs['flat/recommended'].rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_' 
      }]
    }
  }
]