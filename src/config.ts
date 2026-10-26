import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { PROVIDER_IDS, type ProviderId } from './shared/protocol/types.js'
import { isProviderId } from './shared/protocol/validate.js'

/** Environment variable for each provider's key. A variable wins over the config file. */
export const ENV_KEYS: Readonly<Record<ProviderId, string>> = {
  eodhd: 'EODHD_API_KEY',
  twelvedata: 'TWELVEDATA_API_KEY',
  alphavantage: 'ALPHAVANTAGE_API_KEY',
  finnhub: 'FINNHUB_API_KEY',
}

export type KeySource = 'env' | 'file'

export interface LoadedKeys {
  keys: Partial<Record<ProviderId, string>>
  sources: Partial<Record<ProviderId, KeySource>>
  warnings: string[]
  path: string
  fileFound: boolean
}

type Env = Record<string, string | undefined>

/** Where the config file lives: ~/.config/turbobulls-bridge/config.json, or %APPDATA% on Windows. */
export function defaultConfigPath(env: Env = process.env, platform: NodeJS.Platform = process.platform, home: string = homedir()): string {
  const override = env.TURBOBULLS_BRIDGE_CONFIG?.trim()
  if (override) return override
  if (platform === 'win32') return join(env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'turbobulls-bridge', 'config.json')
  return join(env.XDG_CONFIG_HOME ?? join(home, '.config'), 'turbobulls-bridge', 'config.json')
}

export const CONFIG_TEMPLATE = `${JSON.stringify({ keys: Object.fromEntries(PROVIDER_IDS.map((id) => [id, ''])) }, null, 2)}\n`

/**
 * Read the keys from the config file, then from the environment. Problems become warnings that
 * name the file, never its contents.
 */
export async function loadKeys(opts: { env?: Env; path?: string; platform?: NodeJS.Platform } = {}): Promise<LoadedKeys> {
  const env = opts.env ?? process.env
  const platform = opts.platform ?? process.platform
  const path = opts.path ?? defaultConfigPath(env, platform)
  const keys: Partial<Record<ProviderId, string>> = {}
  const sources: Partial<Record<ProviderId, KeySource>> = {}
  const warnings: string[] = []
  let fileFound = false

  let text: string | undefined
  try {
    text = await readFile(path, 'utf8')
    fileFound = true
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') warnings.push(`Could not read ${path}.`)
  }

  if (text !== undefined) {
    if (platform !== 'win32') {
      try {
        const mode = (await stat(path)).mode
        if ((mode & 0o077) !== 0) {
          warnings.push(`${path} can be read by other users on this computer. Run: chmod 600 "${path}"`)
        }
      } catch {
        // The file was readable a moment ago; a failing stat changes nothing about the keys.
      }
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      warnings.push(`${path} is not valid JSON, so no key was read from it.`)
    }
    const fileKeys = typeof parsed === 'object' && parsed !== null ? (parsed as { keys?: unknown }).keys : undefined
    if (parsed !== undefined && (typeof fileKeys !== 'object' || fileKeys === null)) {
      warnings.push(`${path} has no "keys" object, so no key was read from it.`)
    } else if (fileKeys) {
      for (const [name, value] of Object.entries(fileKeys)) {
        if (!isProviderId(name)) {
          warnings.push(`${path} names an unknown provider "${name.slice(0, 32)}". Known: ${PROVIDER_IDS.join(', ')}.`)
          continue
        }
        if (typeof value !== 'string') {
          warnings.push(`${path}: the ${name} key must be a string.`)
          continue
        }
        if (value.trim()) {
          keys[name] = value.trim()
          sources[name] = 'file'
        }
      }
    }
  }

  for (const id of PROVIDER_IDS) {
    const value = env[ENV_KEYS[id]]?.trim()
    if (value) {
      keys[id] = value
      sources[id] = 'env'
    }
  }

  return { keys, sources, warnings, path, fileFound }
}

/** Create the config file with empty keys, readable only by this user. Leaves an existing file alone. */
export async function initConfig(path: string): Promise<'created' | 'exists'> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  try {
    await writeFile(path, CONFIG_TEMPLATE, { mode: 0o600, flag: 'wx' })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return 'exists'
    throw e
  }
  // writeFile's mode is filtered by the umask; set it outright.
  await chmod(path, 0o600)
  return 'created'
}
