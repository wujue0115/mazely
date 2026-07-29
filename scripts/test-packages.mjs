import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repositoryRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const temporaryRoot = await mkdtemp(join(tmpdir(), 'mazely-package-test-'))
const tarballDirectory = join(temporaryRoot, 'tarballs')
const consumerDirectory = join(temporaryRoot, 'consumer')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

function run(command, arguments_, cwd = repositoryRoot) {
  execFileSync(command, arguments_, {
    cwd,
    env: {
      ...process.env,
      npm_config_cache: join(temporaryRoot, 'npm-cache'),
    },
    stdio: 'inherit',
  })
}

async function readPackageVersion(relativePath) {
  const packageJson = JSON.parse(
    await readFile(new URL(relativePath, import.meta.url), 'utf8'),
  )

  return packageJson.version
}

async function findTarball(expectedName) {
  const files = await readdir(tarballDirectory)
  const tarball = files.find(file => file === expectedName)

  if (!tarball) {
    throw new Error(`Unable to find packed tarball: ${expectedName}`)
  }

  return join(tarballDirectory, tarball)
}

try {
  await mkdir(tarballDirectory)
  await mkdir(consumerDirectory)

  run(pnpmCommand, [
    '--filter',
    '@mazely/core',
    'pack',
    '--pack-destination',
    tarballDirectory,
  ])
  run(pnpmCommand, [
    '--filter',
    'mazely',
    'pack',
    '--pack-destination',
    tarballDirectory,
  ])

  const [coreVersion, mazelyVersion] = await Promise.all([
    readPackageVersion('../packages/core/package.json'),
    readPackageVersion('../packages/mazely/package.json'),
  ])
  const coreTarball = await findTarball(`mazely-core-${coreVersion}.tgz`)
  const mazelyTarball = await findTarball(`mazely-${mazelyVersion}.tgz`)

  await writeFile(join(consumerDirectory, 'package.json'), JSON.stringify({
    name: 'mazely-package-install-test',
    private: true,
    type: 'module',
  }, null, 2))
  await writeFile(join(consumerDirectory, 'index.mjs'), `\
import { createMaze } from 'mazely'
import { Mazely } from '@mazely/core'

const maze = createMaze({
  grid: { type: 'square', cols: 3, rows: 3 },
  seed: 42,
})

maze.generate('dfs').finish()

if (!(maze instanceof Mazely)) {
  throw new TypeError('mazely and @mazely/core do not share the expected runtime')
}

console.log('Installed package runtime verified')
`)
  await writeFile(join(consumerDirectory, 'index.ts'), `\
import { createMaze } from 'mazely'
import type { MazeGenerationAlgorithm } from '@mazely/core'

const algorithm: MazeGenerationAlgorithm = 'dfs'
const maze = createMaze({
  grid: { type: 'square', cols: 3, rows: 3 },
})

maze.generate(algorithm).finish()
`)
  await writeFile(join(consumerDirectory, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      noEmit: true,
      skipLibCheck: false,
    },
    include: ['index.ts'],
  }, null, 2))

  run(npmCommand, [
    'install',
    coreTarball,
    mazelyTarball,
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ], consumerDirectory)
  run(process.execPath, ['index.mjs'], consumerDirectory)
  run(process.execPath, [
    join(repositoryRoot, 'node_modules/typescript/bin/tsc'),
    '-p',
    join(consumerDirectory, 'tsconfig.json'),
  ], consumerDirectory)

  console.log('Installed package TypeScript declarations verified')
}
finally {
  await rm(temporaryRoot, { force: true, recursive: true })
}
