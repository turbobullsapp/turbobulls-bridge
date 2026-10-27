import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseCustomSource, type CustomSource } from './shared/custom/definition.js'
import { LIMITS, PROVIDER_IDS, type ProviderId, type SourceId } from './shared/protocol/types.js'
import { isProviderId, isValidSymbol } from './shared/protocol/validate.js'

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
  /** Where each built-in provider's key came from. */
  keySources: Partial<Record<ProviderId, KeySource>>
  /** The custom sources defined in the config file, checked. */
  customSources: CustomSource[]
  /** Keys for custom sources, by source id. */
  customKeys: Record<string, string>
  /** A symbol `turbobulls-bridge test` may ask each custom source for. */
  testSymbols: Record<string, string>
  warnings: string[]
  path: string
  fileFound: boolean
}

/** The key for a built-in provider or a custom source. */
export function keyFor(loaded: LoadedKeys, id: SourceId): string | undefined {
  return isProviderId(id) ? loaded.keys[id] : Object.hasOwn(loaded.customKeys, id) ? loaded.customKeys[id] : undefined
}

type Env = Record<string, string | undefined>

/**
 * Where the config file lives: ~/.config/turbobulls-bridge/config.json, or %LOCALAPPDATA% on
 * Windows (the local profile folder, which roaming profiles do not copy to a server).
 */
export function defaultConfigPath(env: Env = process.env, platform: NodeJS.Platform = process.platform, home: string = homedir()): string {
  const override = env.TURBOBULLS_BRIDGE_CONFIG?.trim()
  if (override) return override
  if (platform === 'win32') return join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'turbobulls-bridge', 'config.json')
  return join(env.XDG_CONFIG_HOME ?? join(home, '.config'), 'turbobulls-bridge', 'config.json')
}

export const CONFIG_TEMPLATE = `${JSON.stringify({ keys: Object.fromEntries(PROVIDER_IDS.map((id) => [id, ''])), sources: [] }, null, 2)}\n`

/**
 * Read the keys from the config file, then from the environment. Problems become warnings that
 * name the file, never its contents.
 */
export async function loadKeys(opts: { env?: Env; path?: string; platform?: NodeJS.Platform } = {}): Promise<LoadedKeys> {
  const env = opts.env ?? process.env
  const platform = opts.platform ?? process.platform
  const path = opts.path ?? defaultConfigPath(env, platform)
  const keys: Partial<Record<ProviderId, string>> = {}
  const keySources: Partial<Record<ProviderId, KeySource>> = {}
  const customSources: CustomSource[] = []
  const customKeys: Record<string, string> = {}
  const testSymbols: Record<string, string> = {}
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
    if (parsed !== undefined && (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))) {
      warnings.push(`${path} is not a JSON object, so nothing was read from it.`)
    } else if (fileKeys !== undefined && (typeof fileKeys !== 'object' || fileKeys === null || Array.isArray(fileKeys))) {
      warnings.push(`${path}: "keys" must be an object of provider names and keys, so no key was read from it.`)
    } else if (fileKeys) {
      for (const [name, value] of Object.entries(fileKeys)) {
        if (!isProviderId(name)) {
          // The name is not repeated: a key pasted in the wrong place would land in the terminal.
          warnings.push(`${path} has an entry for an unknown provider. Known: ${PROVIDER_IDS.join(', ')}.`)
          continue
        }
        if (typeof value !== 'string') {
          warnings.push(`${path}: the ${name} key must be a string.`)
          continue
        }
        if (value.trim()) {
          keys[name] = value.trim()
          keySources[name] = 'file'
        }
      }
    }
    const rawSources = typeof parsed === 'object' && parsed !== null ? (parsed as { sources?: unknown }).sources : undefined
    if (rawSources !== undefined && !Array.isArray(rawSources)) {
      warnings.push(`${path}: "sources" must be a list, so no custom source was read.`)
    } else if (rawSources) {
      readCustomSources(rawSources, path, { customSources, customKeys, testSymbols, warnings })
    }
  }

  for (const id of PROVIDER_IDS) {
    const value = env[ENV_KEYS[id]]?.trim()
    if (value) {
      keys[id] = value
      keySources[id] = 'env'
    }
  }

  return { keys, keySources, customSources, customKeys, testSymbols, warnings, path, fileFound }
}

/**
 * Read the custom sources. A source with a problem is skipped with a warning that names its
 * position and fields, never a value: a key pasted in the wrong place must not land in the terminal.
 */
function readCustomSources(
  rawSources: unknown[],
  path: string,
  out: Pick<LoadedKeys, 'customSources' | 'customKeys' | 'testSymbols' | 'warnings'>,
): void {
  rawSources.forEach((raw, index) => {
    // Named by position only: an id could be a key pasted in the wrong place.
    const label = `source ${index + 1}`
    if (out.customSources.length >= LIMITS.customSources) {
      out.warnings.push(`${path}, ${label}: skipped, only the first ${LIMITS.customSources} sources are used.`)
      return
    }
    const result = parseCustomSource(raw)
    if (!result.ok) {
      out.warnings.push(`${path}, ${label}: skipped. ${result.errors.join(' ')}`)
      return
    }
    const { source } = result
    if (out.customSources.some((s) => s.id === source.id)) {
      out.warnings.push(`${path}, ${label}: skipped, another source has the same id.`)
      return
    }
    out.customSources.push(source)
    const { key, testSymbol } = raw as { key?: unknown; testSymbol?: unknown }
    if (typeof key === 'string' && key.trim()) out.customKeys[source.id] = key.trim()
    else if (key !== undefined && key !== '') out.warnings.push(`${path}, ${label}: the key must be a string.`)
    if (typeof testSymbol === 'string' && isValidSymbol(testSymbol.trim())) out.testSymbols[source.id] = testSymbol.trim()
  })
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
