import antfu from '@antfu/eslint-config'

export default antfu({
  formatters: true,
}, {
  ignores: [
    '**/dist/**',
    '**/node_modules/**',
    '**/coverage/**',
  ],
})
