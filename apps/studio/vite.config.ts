import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '@mazely/core': resolve(__dirname, '../../packages/core/src/index.ts'),
      'mazely': resolve(__dirname, '../../packages/mazely/src/index.ts'),
    },
  },
})
