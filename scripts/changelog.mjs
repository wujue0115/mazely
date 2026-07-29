import { readFile } from 'node:fs/promises'
import process from 'node:process'

const [, , command, version] = process.argv

if (!['extract', 'verify'].includes(command) || !version) {
  console.error('Usage: node scripts/changelog.mjs <extract|verify> <version>')
  process.exit(1)
}

const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8')
const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const headingPattern = new RegExp(
  `^## \\[${escapedVersion}\\] - \\d{4}-\\d{2}-\\d{2}\\s*$`,
  'm',
)
const heading = headingPattern.exec(changelog)

if (!heading) {
  console.error(`CHANGELOG.md is missing a dated [${version}] release section`)
  process.exit(1)
}

const contentStart = heading.index + heading[0].length
const remainingChangelog = changelog.slice(contentStart)
const boundaries = [
  /^## \[/m.exec(remainingChangelog)?.index,
  /^\[[^\]]+\]:\s+/m.exec(remainingChangelog)?.index,
].filter(index => index !== undefined)
const contentEnd = boundaries.length > 0
  ? contentStart + Math.min(...boundaries)
  : changelog.length
const releaseNotes = changelog.slice(contentStart, contentEnd).trim()

if (!releaseNotes) {
  console.error(`CHANGELOG.md release section [${version}] is empty`)
  process.exit(1)
}

if (command === 'extract') {
  process.stdout.write(`${releaseNotes}\n`)
}
else {
  console.log(`CHANGELOG.md contains release notes for ${version}`)
}
