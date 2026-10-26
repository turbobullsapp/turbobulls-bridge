import { request, type Server } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Logger } from './log.js'
import { APP_ORIGIN, createBridgeServer, DEV_ORIGIN, isAllowedHost } from './server.js'
import { fakeFetch, path, TEST_KEY } from './shared/__fixtures__/fake-fetch.js'
import { clearEodhdCurrencyCache } from './shared/providers/eodhd.js'

interface Reply {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
}

/** Send a raw request so the test controls every header, Host included. */
function send(port: number, opts: { method?: string; path: string; headers?: Record<string, string> }): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, method: opts.method ?? 'GET', path: opts.path, headers: { Host: `127.0.0.1:${port}`, ...opts.headers } },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => (body += chunk))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }))
      },
    )
    req.on('error', reject)
    req.end()
  })
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address ? address.port : 0
      probe.close(() => resolve(port))
    })
  })
}

let server: Server
let port: number
let lines: string[]

async function startBridge(allowedOrigins: string[] = [APP_ORIGIN]): Promise<void> {
  port = await freePort()
  lines = []
  const logger: Logger = { info: (m) => lines.push(m), warn: (m) => lines.push(m), error: (m) => lines.push(m) }
  const { fetch } = fakeFetch([{ match: path('/api/eod/AAPL.US'), body: [{ date: '2026-10-23', close: 347.73 }] }])
  server = createBridgeServer({
    port,
    allowedOrigins,
    deps: { version: '0.1.0', getKey: (id) => (id === 'eodhd' ? TEST_KEY : undefined), fetch, now: () => new Date('2026-10-26T12:00:00Z') },
    logger,
  })
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
}

beforeEach(async () => {
  clearEodhdCurrencyCache()
  await startBridge()
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('isAllowedHost', () => {
  it('accepts loopback names on the bridge port only', () => {
    expect(isAllowedHost('127.0.0.1:47821', 47821)).toBe(true)
    expect(isAllowedHost('localhost:47821', 47821)).toBe(true)
    expect(isAllowedHost('[::1]:47821', 47821)).toBe(true)
    expect(isAllowedHost('127.0.0.1:47822', 47821)).toBe(false)
    expect(isAllowedHost('evil.example:47821', 47821)).toBe(false)
    expect(isAllowedHost(undefined, 47821)).toBe(false)
  })
})

describe('bridge server', () => {
  it('answers the app with CORS headers for its origin only', async () => {
    const reply = await send(port, { path: '/v1/hello', headers: { Origin: APP_ORIGIN } })
    expect(reply.status).toBe(200)
    expect(reply.headers['access-control-allow-origin']).toBe(APP_ORIGIN)
    expect(reply.headers.vary).toBe('Origin')
    expect(reply.headers['cache-control']).toBe('no-store')
    const body = JSON.parse(reply.body)
    expect(body).toMatchObject({ id: 'http', ok: true, result: { protocol: 1, connector: 'bridge', version: '0.1.0' } })
    expect(reply.body).not.toContain(TEST_KEY)
  })

  it('refuses a request with no Origin, as another site sends with no-cors', async () => {
    const reply = await send(port, { path: '/v1/hello' })
    expect(reply.status).toBe(403)
    expect(reply.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('refuses other websites, null origins and the dev server unless allowed', async () => {
    for (const origin of ['https://evil.example', 'null', DEV_ORIGIN, 'https://app.turbobulls.com.evil.example']) {
      const reply = await send(port, { path: '/v1/hello', headers: { Origin: origin } })
      expect(reply.status).toBe(403)
      expect(reply.headers['access-control-allow-origin']).toBeUndefined()
    }
  })

  it('answers the dev server when started with --dev', async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await startBridge([APP_ORIGIN, DEV_ORIGIN])
    const reply = await send(port, { path: '/v1/hello', headers: { Origin: DEV_ORIGIN } })
    expect(reply.status).toBe(200)
    expect(reply.headers['access-control-allow-origin']).toBe(DEV_ORIGIN)
  })

  it('refuses a Host other than loopback (DNS rebinding)', async () => {
    const reply = await send(port, { path: '/v1/hello', headers: { Origin: APP_ORIGIN, Host: `rebind.evil.example:${port}` } })
    expect(reply.status).toBe(403)
    expect(reply.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('answers a preflight, including the private network question', async () => {
    const reply = await send(port, {
      method: 'OPTIONS',
      path: '/v1/history',
      headers: { Origin: APP_ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Private-Network': 'true' },
    })
    expect(reply.status).toBe(204)
    expect(reply.headers['access-control-allow-origin']).toBe(APP_ORIGIN)
    expect(reply.headers['access-control-allow-methods']).toBe('GET')
    expect(reply.headers['access-control-allow-private-network']).toBe('true')
  })

  it('refuses other methods, unknown paths and overlong requests', async () => {
    expect((await send(port, { method: 'POST', path: '/v1/hello', headers: { Origin: APP_ORIGIN } })).status).toBe(405)
    expect((await send(port, { path: '/v1/fetch?url=https://example.com', headers: { Origin: APP_ORIGIN } })).status).toBe(404)
    expect((await send(port, { path: `/v1/search?query=${'a'.repeat(3000)}`, headers: { Origin: APP_ORIGIN } })).status).toBe(414)
  })

  it('serves history from query parameters', async () => {
    const reply = await send(port, {
      path: '/v1/history?id=r1&provider=eodhd&symbol=AAPL.US&from=2026-10-20&to=2026-10-24',
      headers: { Origin: APP_ORIGIN },
    })
    expect(reply.status).toBe(200)
    expect(JSON.parse(reply.body)).toEqual({
      id: 'r1',
      ok: true,
      result: { symbol: 'AAPL.US', currency: 'USD', prices: [{ date: '2026-10-23', close: 347.73 }] },
    })
  })

  it('reports protocol errors in the body, with status 200', async () => {
    const reply = await send(port, { path: '/v1/search?provider=finnhub&query=apple', headers: { Origin: APP_ORIGIN } })
    expect(reply.status).toBe(200)
    expect(JSON.parse(reply.body)).toMatchObject({ ok: false, error: { code: 'NOT_CONFIGURED' } })
  })

  it('logs paths and outcomes, never symbols or keys', async () => {
    await send(port, { path: '/v1/history?provider=eodhd&symbol=AAPL.US&from=2026-10-20', headers: { Origin: APP_ORIGIN } })
    await send(port, { path: '/v1/hello', headers: { Origin: 'https://evil.example' } })
    expect(lines.some((l) => l.includes('/v1/history -> 200 ok'))).toBe(true)
    expect(lines.some((l) => l.includes('origin refused'))).toBe(true)
    expect(lines.join('\n')).not.toContain('AAPL')
    expect(lines.join('\n')).not.toContain(TEST_KEY)
  })
})
