import { NextRequest } from 'next/server'
import pino from 'pino'
import { randomUUID } from 'node:crypto'

const baseLogger = pino()

/**
 * Returns a child logger bound to a request-id. If incoming X-Request-ID
 * header is present and looks valid, uses it — otherwise generates one.
 * The logger automatically attaches { rid } to every log record.
 */
export function getRequestLogger(req: NextRequest): { logger: pino.Logger; rid: string } {
  const incoming = req.headers.get('x-request-id')
  const rid = incoming && /^[a-zA-Z0-9\-_]{4,64}$/.test(incoming)
    ? incoming
    : `sar-${randomUUID().replace(/-/g, '').slice(0, 8)}`
  return { logger: baseLogger.child({ rid }), rid }
}
