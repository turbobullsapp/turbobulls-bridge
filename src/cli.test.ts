import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HELP, parseCli } from './cli.js'
import { VERSION } from './version.js'

describe('parseCli', () => {
  it('starts on the app port, on loopback, by default', () => {
    expect(parseCli([], {})).toEqual({ command: 'start', dev: false, port: 47821, host: '127.0.0.1', config: undefined })
  })

  it('reads commands and options', () => {
    expect(parseCli(['init'], {}).command).toBe('init')
    expect(parseCli(['test', '--config', '/tmp/c.json'], {})).toMatchObject({ command: 'test', config: '/tmp/c.json' })
    expect(parseCli(['--dev', '--port', '5000'], {})).toMatchObject({ dev: true, port: 5000 })
    expect(parseCli(['-h'], {}).command).toBe('help')
    expect(parseCli(['--version'], {}).command).toBe('version')
  })

  it('takes host and port from the environment, as the container sets them', () => {
    expect(parseCli([], { TURBOBULLS_BRIDGE_HOST: '0.0.0.0', TURBOBULLS_BRIDGE_PORT: '47821' })).toMatchObject({ host: '0.0.0.0', port: 47821 })
    // Generic names do nothing: a stray BRIDGE_HOST in a shell profile must not expose the bridge.
    expect(parseCli([], { BRIDGE_HOST: '0.0.0.0', BRIDGE_PORT: '1' })).toMatchObject({ host: '127.0.0.1', port: 47821 })
  })

  it('refuses what it cannot use', () => {
    expect(() => parseCli(['serve'], {})).toThrow('Unknown command')
    expect(() => parseCli(['--port', 'abc'], {})).toThrow('port')
    expect(() => parseCli(['--port', '70000'], {})).toThrow('port')
    expect(() => parseCli(['--bogus'], {})).toThrow()
  })
})

describe('package', () => {
  it('reports the version package.json says', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
    expect(VERSION).toBe(pkg.version)
  })

  it('names every key variable in the help', () => {
    for (const name of ['EODHD_API_KEY', 'TWELVEDATA_API_KEY', 'ALPHAVANTAGE_API_KEY', 'FINNHUB_API_KEY', 'TURBOBULLS_BRIDGE_HOST', 'TURBOBULLS_BRIDGE_PORT', 'TURBOBULLS_BRIDGE_CONFIG']) {
      expect(HELP).toContain(name)
    }
  })
})
