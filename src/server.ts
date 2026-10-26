import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Logger } from './log.js'
import { dispatch, type DispatchDeps } from './shared/dispatch.js'
import type { ConnectorResponse, ErrorCode } from './shared/protocol/types.js'

/** The Turbobulls app looks for the bridge here and nowhere else. */
export const DEFAULT_PORT = 47821
export const APP_ORIGIN = 'https://app.turbobulls.com'
/** The app's local development server, allowed only with --dev. */
export const DEV_ORIGIN = 'http://localhost:3000'

const MAX_URL_LENGTH = 2048
const PATHS: Readonly<Record<string, 'hello' | 'search' | 'history'>> = {
  '/v1/hello': 'hello',
  '/v1/search': 'search',
  '/v1/history': 'history',
}
const PARAM_NAMES = ['provider', 'query', 'symbol', 'from', 'to'] as const

export interface BridgeServerOptions {
  /** The port the browser connects to; the Host header must name it. */
  port: number
  allowedOrigins: readonly string[]
  deps: Omit<DispatchDeps, 'connector' | 'openSettings'>
  logger?: Logger
}

/**
 * The browser addresses the bridge as 127.0.0.1 or localhost. Any other Host means a page reached
 * it through a name that resolves here (DNS rebinding), so it is refused.
 */
export function isAllowedHost(host: string | undefined, port: number): boolean {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}` || host === `[::1]:${port}`
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
  })
  res.end(text)
}

function refusal(code: ErrorCode, message: string): ConnectorResponse {
  return { id: '', ok: false, error: { code, message } }
}

async function handle(req: IncomingMessage, res: ServerResponse, opts: BridgeServerOptions): Promise<void> {
  const started = Date.now()
  const method = req.method ?? 'GET'
  const url = req.url ?? '/'
  const path = url.split('?')[0] ?? '/'
  // Log the path only: the query holds the symbol, which is the user's business.
  const done = (status: number, outcome: string) =>
    opts.logger?.info(`${method} ${path.slice(0, 64)} -> ${status} ${outcome} (${Date.now() - started} ms)`)

  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Vary', 'Origin')

  if (!isAllowedHost(req.headers.host, opts.port)) {
    send(res, 403, refusal('BAD_REQUEST', 'The bridge only answers requests sent to 127.0.0.1.'))
    return done(403, 'host refused')
  }
  const origin = req.headers.origin
  if (typeof origin !== 'string' || !opts.allowedOrigins.includes(origin)) {
    send(res, 403, refusal('BAD_REQUEST', 'The bridge only answers the Turbobulls app.'))
    return done(403, 'origin refused')
  }
  res.setHeader('Access-Control-Allow-Origin', origin)

  if (method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET')
    res.setHeader('Access-Control-Max-Age', '600')
    if (req.headers['access-control-request-private-network'] === 'true') {
      res.setHeader('Access-Control-Allow-Private-Network', 'true')
    }
    res.writeHead(204)
    res.end()
    return done(204, 'preflight')
  }
  if (method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS')
    send(res, 405, refusal('BAD_REQUEST', 'The bridge only answers GET requests.'))
    return done(405, 'method refused')
  }
  if (url.length > MAX_URL_LENGTH) {
    send(res, 414, refusal('BAD_REQUEST', 'That request is too long.'))
    return done(414, 'too long')
  }
  const op = PATHS[path]
  if (!op) {
    send(res, 404, refusal('UNSUPPORTED_OPERATION', 'The bridge has no such path.'))
    return done(404, 'unknown path')
  }

  const query = new URL(url, 'http://127.0.0.1').searchParams
  const params: Record<string, string> = {}
  for (const name of PARAM_NAMES) {
    const value = query.get(name)
    if (value !== null) params[name] = value
  }
  const answer = await dispatch(
    { v: Number(query.get('v') ?? '1'), id: query.get('id') ?? 'http', op, params },
    { ...opts.deps, connector: 'bridge' },
  )
  send(res, 200, answer)
  done(200, answer.ok ? 'ok' : answer.error.code)
}

export function createBridgeServer(opts: BridgeServerOptions): Server {
  return createServer((req, res) => {
    handle(req, res, opts).catch(() => {
      if (!res.headersSent) send(res, 500, refusal('PROVIDER_ERROR', 'The bridge could not answer.'))
      else res.end()
    })
  })
}
