#!/usr/bin/env node
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { defaultConfigPath, ENV_KEYS, initConfig, loadKeys, type LoadedKeys } from './config.js'
import { consoleLogger, type Logger } from './log.js'
import { APP_ORIGIN, createBridgeServer, DEFAULT_PORT, DEV_ORIGIN } from './server.js'
import { dispatch } from './shared/dispatch.js'
import { PROVIDER_IDS } from './shared/protocol/types.js'
import { ADAPTERS } from './shared/providers/registry.js'
import type { FetchLike } from './shared/providers/types.js'
import { VERSION } from './version.js'

export const HELP = `Turbobulls bridge ${VERSION}

Fetches daily prices from your own market-data provider, with your own API key,
on this computer, for the Turbobulls app. Your key never leaves this computer
except to reach the provider it belongs to.

Usage:
  turbobulls-bridge            Start the bridge (leave it running while you use Turbobulls)
  turbobulls-bridge init       Create the config file for your keys
  turbobulls-bridge test       Check each key you set with one small request

Options:
  --dev           Also answer the app's local development server (${DEV_ORIGIN})
  --port <n>      Port to listen on (default ${DEFAULT_PORT}; the app only looks there)
  --host <addr>   Address to listen on (default 127.0.0.1; 0.0.0.0 only inside a container)
  --config <path> Config file to read (default: ${defaultConfigPath()})
  -h, --help      Show this help
  -v, --version   Show the version

Keys come from the config file or from these environment variables:
${PROVIDER_IDS.map((id) => `  ${ENV_KEYS[id].padEnd(25)} ${ADAPTERS[id].name}`).join('\n')}

Other environment variables:
  TURBOBULLS_BRIDGE_CONFIG  Config file to read
  TURBOBULLS_BRIDGE_HOST    Same as --host (the container image sets 0.0.0.0)
  TURBOBULLS_BRIDGE_PORT    Same as --port
`

export interface CliOptions {
  command: 'start' | 'init' | 'test' | 'help' | 'version'
  dev: boolean
  port: number
  host: string
  config: string | undefined
}

/** Read the command line. Throws an Error with a plain message for anything it cannot use. */
export function parseCli(argv: string[], env: Record<string, string | undefined> = process.env): CliOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      dev: { type: 'boolean', default: false },
      port: { type: 'string' },
      host: { type: 'string' },
      config: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  })
  let command: CliOptions['command'] = 'start'
  if (values.help) command = 'help'
  else if (values.version) command = 'version'
  else if (positionals.length > 0) {
    const first = positionals[0]
    if (first === 'init' || first === 'test' || first === 'start') command = first
    else throw new Error(`Unknown command "${String(first).slice(0, 32)}". Run turbobulls-bridge --help.`)
  }
  const portText = values.port ?? env.TURBOBULLS_BRIDGE_PORT ?? String(DEFAULT_PORT)
  const port = Number(portText)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('The port must be a whole number from 1 to 65535.')
  return {
    command,
    dev: values.dev === true,
    port,
    host: values.host ?? env.TURBOBULLS_BRIDGE_HOST ?? '127.0.0.1',
    config: values.config,
  }
}

function describeKeys(loaded: LoadedKeys): string {
  const set = PROVIDER_IDS.filter((id) => loaded.keys[id])
  if (set.length === 0) {
    return `No keys yet. Run "turbobulls-bridge init", add a key to ${loaded.path}, then start the bridge again.`
  }
  return `Keys: ${set.map((id) => `${ADAPTERS[id].name} (${loaded.sources[id] === 'env' ? 'environment' : 'config file'})`).join(', ')}`
}

const fetchImpl: FetchLike = (url, init) => fetch(url, init)

async function start(opts: CliOptions, log: Logger): Promise<void> {
  const loaded = await loadKeys(opts.config ? { path: opts.config } : {})
  for (const w of loaded.warnings) log.warn(`Warning: ${w}`)
  const allowedOrigins = opts.dev ? [APP_ORIGIN, DEV_ORIGIN] : [APP_ORIGIN]
  if (opts.port !== DEFAULT_PORT) log.warn(`Warning: the Turbobulls app only looks for the bridge on port ${DEFAULT_PORT}.`)
  if (!['127.0.0.1', 'localhost', '::1'].includes(opts.host)) {
    log.warn(
      `Listening on ${opts.host}. Outside a container this lets other machines use your keys. In a container, ` +
        `publish the port to this computer only: -p 127.0.0.1:${opts.port}:${opts.port}`,
    )
  }
  const server = createBridgeServer({
    port: opts.port,
    allowedOrigins,
    deps: { version: VERSION, getKey: (id) => loaded.keys[id], fetch: fetchImpl },
    logger: log,
  })
  server.on('error', (e: NodeJS.ErrnoException) => {
    log.error(
      e.code === 'EADDRINUSE'
        ? `Port ${opts.port} is already in use. Is the bridge already running in another window?`
        : `The bridge could not start: ${e.message}`,
    )
    process.exit(1)
  })
  server.listen(opts.port, opts.host, () => {
    log.info(`Turbobulls bridge ${VERSION}`)
    log.info(describeKeys(loaded))
    log.info(`Answering ${allowedOrigins.join(' and ')} on http://127.0.0.1:${opts.port}`)
    log.info('Leave this running while you use Turbobulls. Press Ctrl+C to stop.')
  })
  const stop = () => server.close(() => process.exit(0))
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}

async function init(opts: CliOptions, log: Logger): Promise<void> {
  const path = opts.config ?? defaultConfigPath()
  const outcome = await initConfig(path)
  log.info(outcome === 'created' ? `Created ${path} (readable only by you).` : `${path} already exists; left as it is.`)
  log.info('Open it, paste your key next to the provider you use, save, then run "turbobulls-bridge".')
}

async function test(opts: CliOptions, log: Logger): Promise<void> {
  const loaded = await loadKeys(opts.config ? { path: opts.config } : {})
  for (const w of loaded.warnings) log.warn(`Warning: ${w}`)
  const set = PROVIDER_IDS.filter((id) => loaded.keys[id])
  if (set.length === 0) {
    log.info(describeKeys(loaded))
    return
  }
  for (const id of set) {
    const answer = await dispatch(
      { v: 1, id: 'test', op: 'search', params: { provider: id, query: 'Apple' } },
      { connector: 'bridge', version: VERSION, getKey: (p) => loaded.keys[p], fetch: fetchImpl },
    )
    log.info(answer.ok ? `${ADAPTERS[id].name}: the key works.` : `${ADAPTERS[id].name}: ${answer.error.message} (${answer.error.code})`)
  }
}

export async function main(argv: string[], log: Logger = consoleLogger): Promise<void> {
  let opts: CliOptions
  try {
    opts = parseCli(argv)
  } catch (e) {
    log.error((e as Error).message)
    process.exitCode = 2
    return
  }
  switch (opts.command) {
    case 'help':
      log.info(HELP)
      return
    case 'version':
      log.info(VERSION)
      return
    case 'init':
      return init(opts, log)
    case 'test':
      return test(opts, log)
    case 'start':
      return start(opts, log)
  }
}

function isEntryPoint(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isEntryPoint()) {
  main(process.argv.slice(2)).catch((e: unknown) => {
    consoleLogger.error(e instanceof Error ? e.message : 'The bridge stopped on an unexpected error.')
    process.exit(1)
  })
}
