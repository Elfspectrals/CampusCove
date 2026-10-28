// Public link to the local stack, for friends to playtest from home (`make share-local`).
//
//   node scripts/share-local.mjs
//
// Needs the Docker stack up (`make up`: API 8000, socket 3000) and cloudflared installed
// (`winget install Cloudflare.cloudflared`). Opens a quick Cloudflare tunnel on the socket, builds the front
// with that socket URL baked in (VITE_SOCKET_URL), serves the build with `vite preview` (which proxies /api to
// 8000) and opens a second tunnel on it. Prints the link to share; Ctrl+C stops everything.
// Quick tunnel URLs are random and change on every run.
import { spawn } from 'node:child_process'
import { Resolver } from 'node:dns/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const VITE_BIN = join(FRONT_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const PREVIEW_PORT = 4173
const API_HEALTH_URL = 'http://localhost:8000/api/health'
const SOCKET_URL = 'http://localhost:3000'
const TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/
const WINDOWS_CLOUDFLARED = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe'

const children = []

function stopAll(code = 0) {
  for (const child of children) child.kill()
  process.exit(code)
}

function fail(message) {
  console.error(`\n✖ ${message}`)
  stopAll(1)
}

process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function isUp(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(5000) })).ok
  } catch {
    return false
  }
}

/**
 * A fresh quick-tunnel hostname takes a few seconds to exist. Asking the OS too early makes Windows cache the
 * NXDOMAIN for minutes, so poll a public resolver first and only then touch the URL.
 */
async function waitForDns(url, timeoutMs = 90_000) {
  const resolver = new Resolver()
  resolver.setServers(['1.1.1.1', '8.8.8.8'])
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      await resolver.resolve4(new URL(url).hostname)
      return
    } catch {
      await sleep(2000)
    }
  }
  fail(`${url} never appeared in DNS`)
}

async function waitUntilUp(url, label, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isUp(url)) return
    await sleep(2000)
  }
  fail(`${label} does not answer at ${url}`)
}

function cloudflaredPath() {
  if (process.platform === 'win32' && existsSync(WINDOWS_CLOUDFLARED)) return WINDOWS_CLOUDFLARED
  return 'cloudflared'
}

/** Starts a quick tunnel to localhost:port and resolves with its public https URL. */
function openTunnel(port) {
  return new Promise((resolve) => {
    const child = spawn(cloudflaredPath(), ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`])
    children.push(child)
    let log = ''
    const onData = (chunk) => {
      log += chunk
      const match = log.match(TUNNEL_URL_RE)
      if (match) resolve(match[0])
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('error', () => fail('cloudflared not found. Install it: winget install Cloudflare.cloudflared'))
    child.on('exit', (code) => fail(`cloudflared (port ${port}) exited with code ${code}\n${log.slice(-800)}`))
  })
}

function runVite(args, env) {
  const child = spawn(process.execPath, [VITE_BIN, ...args], { cwd: FRONT_DIR, env, stdio: 'inherit' })
  children.push(child)
  return child
}

if (!(await isUp(API_HEALTH_URL))) fail(`API not reachable at ${API_HEALTH_URL}. Start the stack: make up`)
if (!(await isUp(SOCKET_URL))) fail(`Socket not reachable at ${SOCKET_URL}. Start the stack: make up`)

console.log('→ Tunnel for the socket (3000)…')
const socketTunnel = await openTunnel(3000)
await waitForDns(socketTunnel)
await waitUntilUp(socketTunnel, 'Socket tunnel')
console.log(`  ${socketTunnel}`)

console.log('→ Building the front…')
// VITE_API_URL unset: the build falls back to same-origin /api, proxied by vite preview.
const { VITE_API_URL: _unused, ...baseEnv } = process.env
const env = { ...baseEnv, VITE_SOCKET_URL: socketTunnel }
const build = runVite(['build', '--logLevel', 'warn'], env)
const buildCode = await new Promise((resolve) => build.on('exit', resolve))
children.splice(children.indexOf(build), 1)
if (buildCode !== 0) fail(`vite build failed (code ${buildCode})`)

console.log(`→ Serving the build on ${PREVIEW_PORT}…`)
const preview = runVite(['preview', '--port', String(PREVIEW_PORT), '--strictPort', '--host', '127.0.0.1'], env)
preview.on('exit', (code) => fail(`vite preview exited with code ${code} (port ${PREVIEW_PORT} busy?)`))
await waitUntilUp(`http://localhost:${PREVIEW_PORT}/`, 'vite preview', 30_000)

console.log(`→ Tunnel for the front (${PREVIEW_PORT})…`)
const frontTunnel = await openTunnel(PREVIEW_PORT)
await waitForDns(frontTunnel)
await waitUntilUp(frontTunnel, 'Front tunnel')
await waitUntilUp(`${frontTunnel}/api/health`, 'API through the front tunnel')

console.log(`\n✔ Link to share:\n\n    ${frontTunnel}\n`)
console.log('Keep this PC, Docker and this terminal running. Ctrl+C to stop.')
