import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CONFIG_TEMPLATE, defaultConfigPath, initConfig, loadKeys } from './config.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tb-bridge-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const posix = process.platform !== 'win32'

describe('defaultConfigPath', () => {
  it('uses ~/.config, XDG_CONFIG_HOME, %APPDATA% or the override', () => {
    expect(defaultConfigPath({}, 'darwin', '/Users/me')).toBe('/Users/me/.config/turbobulls-bridge/config.json')
    expect(defaultConfigPath({ XDG_CONFIG_HOME: '/xdg' }, 'linux', '/home/me')).toBe('/xdg/turbobulls-bridge/config.json')
    expect(defaultConfigPath({ APPDATA: 'C:/Users/me/AppData/Roaming' }, 'win32', 'C:/Users/me')).toContain('turbobulls-bridge')
    expect(defaultConfigPath({ TURBOBULLS_BRIDGE_CONFIG: '/etc/tb.json' }, 'linux', '/home/me')).toBe('/etc/tb.json')
  })
})

describe('loadKeys', () => {
  it('reads keys from the file and lets the environment win', async () => {
    const path = join(dir, 'config.json')
    await writeFile(path, JSON.stringify({ keys: { eodhd: ' file-key ', twelvedata: '' } }), { mode: 0o600 })
    const loaded = await loadKeys({ path, env: { FINNHUB_API_KEY: 'env-fh', EODHD_API_KEY: 'env-eod' } })
    expect(loaded.keys).toEqual({ eodhd: 'env-eod', finnhub: 'env-fh' })
    expect(loaded.sources).toEqual({ eodhd: 'env', finnhub: 'env' })
    expect(loaded.fileFound).toBe(true)
    expect(loaded.warnings).toEqual([])
  })

  it('is fine with no file at all', async () => {
    const loaded = await loadKeys({ path: join(dir, 'missing.json'), env: {} })
    expect(loaded).toMatchObject({ keys: {}, fileFound: false, warnings: [] })
  })

  it('warns about unknown providers, wrong types and broken JSON without printing values', async () => {
    const path = join(dir, 'config.json')
    await writeFile(path, JSON.stringify({ keys: { yahoo: 'secret-1', eodhd: 42 } }), { mode: 0o600 })
    const loaded = await loadKeys({ path, env: {} })
    expect(loaded.keys).toEqual({})
    expect(loaded.warnings).toHaveLength(2)
    expect(loaded.warnings.join(' ')).not.toContain('secret-1')

    await writeFile(path, '{ "keys": { "eodhd": "secret-2" ', { mode: 0o600 })
    const broken = await loadKeys({ path, env: {} })
    expect(broken.warnings).toEqual([`${path} is not valid JSON, so no key was read from it.`])
  })

  it.runIf(posix)('warns when other users can read the file', async () => {
    const path = join(dir, 'config.json')
    await writeFile(path, JSON.stringify({ keys: { eodhd: 'k' } }))
    await chmod(path, 0o644)
    expect((await loadKeys({ path, env: {} })).warnings[0]).toContain('chmod 600')
    await chmod(path, 0o600)
    expect((await loadKeys({ path, env: {} })).warnings).toEqual([])
  })
})

describe('initConfig', () => {
  it('creates a file only its owner can read, once', async () => {
    const path = join(dir, 'nested', 'config.json')
    expect(await initConfig(path)).toBe('created')
    expect(await readFile(path, 'utf8')).toBe(CONFIG_TEMPLATE)
    if (posix) expect((await stat(path)).mode & 0o777).toBe(0o600)
    expect(await initConfig(path)).toBe('exists')
    expect(JSON.parse(CONFIG_TEMPLATE)).toEqual({ keys: { eodhd: '', twelvedata: '', alphavantage: '', finnhub: '' } })
  })
})
