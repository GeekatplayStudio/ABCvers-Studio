#!/usr/bin/env node
/**
 * ABCvers Studio - dispatches `npm run app:install|app:start|app:stop` to the
 * right script for the platform, so the same command works everywhere.
 *
 * Extra arguments pass straight through:
 *   npm run app:start -- -Port 8080     (Windows)
 *   npm run app:start -- --port 8080    (macOS / Linux)
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const COMMANDS = new Set(['install', 'start', 'stop'])

const here = dirname(fileURLToPath(import.meta.url))
const [command, ...rest] = process.argv.slice(2)

if (!COMMANDS.has(command)) {
  console.error(`Usage: node scripts/run.mjs <${[...COMMANDS].join('|')}> [options]`)
  process.exit(2)
}

const file = 'bash'
const args = [join(here, `${command}.sh`), ...rest]

const child = spawn(file, args, { stdio: 'inherit' })
child.on('error', (error) => {
  console.error(`Could not run ${command}: ${error.message}`)
  process.exit(1)
})
child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0))
})
