import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

const [, , version, ...flags] = process.argv
const dryRun = flags.includes('--dry-run')
const commitSha = process.env.GITHUB_SHA
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const packages = [
  { name: '@mazely/core', tarballName: `mazely-core-${version}.tgz` },
  { name: 'mazely', tarballName: `mazely-${version}.tgz` },
]

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: node scripts/publish-packages.mjs <X.Y.Z> [--dry-run]')
  process.exit(1)
}

if (!dryRun && !commitSha) {
  console.error('Refusing to publish outside GitHub Actions without GITHUB_SHA')
  process.exit(1)
}

function getPublishedPackage(packageName) {
  const result = spawnSync(
    npmCommand,
    [
      'view',
      `${packageName}@${version}`,
      'version',
      'dist.integrity',
      'gitHead',
      '--json',
    ],
    { encoding: 'utf8' },
  )

  if (result.status === 0) {
    return JSON.parse(result.stdout)
  }

  const output = `${result.stdout}\n${result.stderr}`
  if (output.includes('E404')) {
    return null
  }

  throw new Error(`Unable to query ${packageName}@${version}:\n${output.trim()}`)
}

function run(command, arguments_) {
  execFileSync(command, arguments_, {
    env: process.env,
    stdio: 'inherit',
  })
}

const temporaryRoot = await mkdtemp(join(tmpdir(), 'mazely-publish-'))

try {
  for (const package_ of packages) {
    run(pnpmCommand, [
      '--filter',
      package_.name,
      'pack',
      '--pack-destination',
      temporaryRoot,
    ])

    const files = await readdir(temporaryRoot)
    const tarball = files.find(file => file === package_.tarballName)

    if (!tarball) {
      throw new Error(`Unable to find tarball for ${package_.name}@${version}`)
    }

    const tarballPath = join(temporaryRoot, tarball)
    const localIntegrity = `sha512-${
      createHash('sha512')
        .update(await readFile(tarballPath))
        .digest('base64')
    }`
    const published = getPublishedPackage(package_.name)

    if (published) {
      if (published['dist.integrity'] !== localIntegrity) {
        throw new Error(
          `${package_.name}@${version} already exists with different contents`,
        )
      }

      if (commitSha && published.gitHead && published.gitHead !== commitSha) {
        throw new Error(
          `${package_.name}@${version} already exists with gitHead `
          + `${published.gitHead}, expected ${commitSha}`,
        )
      }

      console.log(`${package_.name}@${version} already published with matching contents; skipping`)
      continue
    }

    const publishArguments = [
      'publish',
      tarballPath,
      '--access',
      'public',
    ]
    if (dryRun) {
      publishArguments.push('--dry-run')
    }

    run(npmCommand, publishArguments)
  }
}
finally {
  await rm(temporaryRoot, { force: true, recursive: true })
}
