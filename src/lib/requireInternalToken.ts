import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

/**
 * Guard for mutating endpoints. Reads Bearer token from Authorization header
 * and compares timing-safely with SUNO_API_INTERNAL_TOKEN env.
 * Returns NextResponse with 401/503 on failure, or null if authorized.
 */
export function requireInternalToken(req: NextRequest): NextResponse | null {
  const expected = process.env.SUNO_API_INTERNAL_TOKEN;
  if (!expected || !expected.trim()) {
    return NextResponse.json(
      { error: 'Server misconfigured: SUNO_API_INTERNAL_TOKEN not set' },
      { status: 503 }
    );
  }
  const authHeader = req.headers.get('authorization') ?? '';
  const expectedHeader = `Bearer ${expected}`;
  if (authHeader.length !== expectedHeader.length) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const ok = crypto.timingSafeEqual(
      Buffer.from(authHeader),
      Buffer.from(expectedHeader)
    );
    if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
