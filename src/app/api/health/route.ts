import { NextResponse, NextRequest } from "next/server";
import { cookies } from 'next/headers';
import { sunoApi } from "@/lib/SunoApi";
import { corsHeaders } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Thresholds for health scoring (milliseconds).
const JWT_OK_MS = 5 * 60 * 1000;   // <5min -> ok
const JWT_DEGRADED_MS = 10 * 60 * 1000; // <10min -> degraded, otherwise down

// Process start time (captured once per runtime) for uptime reporting.
const PROCESS_START = Date.now();

type HealthStatus = 'ok' | 'degraded' | 'down';
type SunoAuthStatus = 'ok' | 'unknown' | 'fail';

export async function GET(_req: NextRequest) {
  const timestamp = new Date().toISOString();
  const uptime_sec = Math.floor((Date.now() - PROCESS_START) / 1000);

  const env = {
    has_suno_cookie: Boolean(process.env.SUNO_COOKIE && process.env.SUNO_COOKIE.trim()),
    has_suno_session_id: Boolean(process.env.SUNO_SESSION_ID && process.env.SUNO_SESSION_ID.trim()),
    has_twocaptcha_key: Boolean(process.env.TWOCAPTCHA_KEY && process.env.TWOCAPTCHA_KEY.trim()),
    browser: (process.env.BROWSER || 'chromium').toLowerCase(),
    browser_headless: process.env.BROWSER_HEADLESS
      ? !['0', 'false', 'no', 'off'].includes(process.env.BROWSER_HEADLESS.toLowerCase())
      : true,
  };

  let status: HealthStatus = 'ok';
  let suno_auth_status: SunoAuthStatus = 'unknown';
  let last_refresh_sec_ago: number | null = null;

  try {
    // Reuse cached SunoApi instance if present; do NOT call /api/c/check
    // or launch Playwright — this endpoint must remain cheap.
    const api = await sunoApi((await cookies()).toString());
    const ageMs = api.getTokenAgeMs();
    if (typeof ageMs === 'number') {
      last_refresh_sec_ago = Math.floor(ageMs / 1000);
      if (ageMs < JWT_OK_MS) {
        status = 'ok';
        suno_auth_status = 'ok';
      } else if (ageMs < JWT_DEGRADED_MS) {
        status = 'degraded';
        suno_auth_status = 'ok';
      } else {
        status = 'down';
        suno_auth_status = 'fail';
      }
    } else {
      // getInstance() succeeded but we have no token age -> unknown auth state.
      status = 'degraded';
      suno_auth_status = 'unknown';
    }
  } catch (_err) {
    status = 'down';
    suno_auth_status = 'fail';
  }

  const body = {
    status,
    timestamp,
    uptime_sec,
    env,
    suno_auth: {
      status: suno_auth_status,
      last_refresh_sec_ago,
    },
  };

  const httpStatus = status === 'down' ? 503 : 200;

  return new NextResponse(JSON.stringify(body), {
    status: httpStatus,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders,
    },
  });
}

export async function OPTIONS(_request: Request) {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}
