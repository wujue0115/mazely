import { execFileSync } from 'node:child_process'
import process from 'node:process'

const requiredFiles = [
  'LICENSE',
  'README.md',
  'dist/index.d.mts',
  'dist/index.mjs',
  'package.json',
]

for (const packageName of ['@mazely/core', 'mazely']) {
  const output = execFileSync(
    'pnpm',
    ['--filter', packageName, 'pack', '--dry-run', '--json'],
    { encoding: 'utf8' },
  )
  const packed = JSON.parse(output)
  const files = new Set(packed.files.map(file => file.path))
  const missingFiles = requiredFiles.filter(file => !files.has(file))

  if (missingFiles.length > 0) {
    console.error(`${packageName} tarball is missing: ${missingFiles.join(', ')}`)
    process.exitCode = 1
    continue
  }

  console.log(`${packageName}@${packed.version} tarball contents verified`)
}
