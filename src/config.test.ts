import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CONFIG_TEMPLATE, defaultConfigPath, initConfig, keyFor, loadKeys } from './config.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tb-bridge-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const posix = process.platform !== 'win32'

describe('defaultConfigPath', () => {
  it('uses ~/.config, XDG_CONFIG_HOME, %LOCALAPPDATA% or the override', () => {
    expect(defaultConfigPath({}, 'darwin', '/Users/me')).toBe('/Users/me/.config/turbobulls-bridge/config.json')
    expect(defaultConfigPath({ XDG_CONFIG_HOME: '/xdg' }, 'linux', '/home/me')).toBe('/xdg/turbobulls-bridge/config.json')
    expect(defaultConfigPath({ LOCALAPPDATA: 'C:/Users/me/AppData/Local', APPDATA: 'C:/Users/me/AppData/Roaming' }, 'win32', 'C:/Users/me')).toBe(
      join('C:/Users/me/AppData/Local', 'turbobulls-bridge', 'config.json'),
    )
    expect(defaultConfigPath({ TURBOBULLS_BRIDGE_CONFIG: '/etc/tb.json' }, 'linux', '/home/me')).toBe('/etc/tb.json')
  })
})

describe('loadKeys', () => {
  it('reads keys from the file and lets the environment win', async () => {
    const path = join(dir, 'config.json')
    await writeFile(path, JSON.stringify({ keys: { eodhd: ' file-key ', twelvedata: '' } }), { mode: 0o600 })
    const loaded = await loadKeys({ path, env: { FINNHUB_API_KEY: 'env-fh', EODHD_API_KEY: 'env-eod' } })
    expect(loaded.keys).toEqual({ eodhd: 'env-eod', finnhub: 'env-fh' })
    expect(loaded.keySources).toEqual({ eodhd: 'env', finnhub: 'env' })
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
    expect(loaded.warnings.join(' ')).not.toContain('yahoo')

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
    expect(JSON.parse(CONFIG_TEMPLATE)).toEqual({ keys: { eodhd: '', twelvedata: '', alphavantage: '', finnhub: '' }, sources: [] })
  })
})

describe('custom sources in the config file', () => {
  const good = {
    id: 'mypension',
    name: 'My pension fund',
    url: 'https://api.example.com/nav/{SYMBOL}',
    format: 'json',
    json: { items: 'data', date: 'day', close: 'nav' },
    currency: 'EUR',
    key: ' source-key ',
    testSymbol: 'RO123',
  }

  it('reads valid sources with their keys and test symbols', async () => {
    const path = join(dir, 'config.json')
    await writeFile(path, JSON.stringify({ keys: {}, sources: [good] }), { mode: 0o600 })
    const loaded = await loadKeys({ path, env: {} })
    expect(loaded.warnings).toEqual([])
    expect(loaded.customSources.map((s) => s.id)).toEqual(['mypension'])
    expect(loaded.customKeys).toEqual({ mypension: 'source-key' })
    expect(loaded.testSymbols).toEqual({ mypension: 'RO123' })
    expect(keyFor(loaded, 'mypension')).toBe('source-key')
    expect(keyFor(loaded, 'eodhd')).toBeUndefined()
    expect(keyFor(loaded, 'constructor')).toBeUndefined()
  })

  it('skips broken, duplicate and surplus sources with warnings that hold no values', async () => {
    const path = join(dir, 'config.json')
    const broken = { ...good, id: 'broken', url: 'http://secret-host.example/x', key: 'secret-key-999' }
    const many = Array.from({ length: 13 }, (_, i) => ({ ...good, id: `src${i}` }))
    await writeFile(path, JSON.stringify({ sources: [broken, good, { ...good }, ...many] }), { mode: 0o600 })
    const loaded = await loadKeys({ path, env: {} })
    expect(loaded.customSources).toHaveLength(12)
    expect(loaded.warnings.some((w) => w.includes('source 1 (broken)') && w.includes('https://'))).toBe(true)
    expect(loaded.warnings.some((w) => w.includes('same id'))).toBe(true)
    expect(loaded.warnings.some((w) => w.includes('only the first 12'))).toBe(true)
    expect(loaded.warnings.join(' ')).not.toContain('secret-key-999')
    expect(loaded.warnings.join(' ')).not.toContain('secret-host')
  })

  it('warns when sources is not a list', async () => {
    const path = join(dir, 'config.json')
    await writeFile(path, JSON.stringify({ sources: { id: 'x' } }), { mode: 0o600 })
    const loaded = await loadKeys({ path, env: {} })
    expect(loaded.warnings).toHaveLength(1)
    expect(loaded.warnings[0]).toContain('must be a list')
  })
})
