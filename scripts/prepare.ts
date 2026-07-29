import { existsSync } from 'node:fs'
import process from 'node:process'
import { execa } from 'execa'

async function run() {
  if (!existsSync('.git')) {
    console.log('[prepare] no .git directory, skip git hooks setup')
    return
  }
  await execa('npx', ['simple-git-hooks'], { stdio: 'inherit' })
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
