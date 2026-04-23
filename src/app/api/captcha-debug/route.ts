import { NextResponse, NextRequest } from "next/server";
import { corsHeaders } from "@/lib/utils";
import { requireInternalToken } from "@/lib/requireInternalToken";
import axios from 'axios';

export const dynamic = "force-dynamic";

/**
 * TEMPORARY diagnostic endpoint to debug 2Captcha integration.
 * Calls getbalance + attempts hCaptcha submit, returns raw responses.
 * Remove after captcha flow is verified working.
 *
 * Auth: same SUNO_API_INTERNAL_TOKEN Bearer as mutating endpoints.
 */
export async function GET(req: NextRequest) {
  const authError = requireInternalToken(req);
  if (authError) return authError;

  const apiKey = process.env.TWOCAPTCHA_KEY?.trim() || '';
  const keyInfo = {
    length: apiKey.length,
    prefix: apiKey.slice(0, 4),
    suffix: apiKey.slice(-4),
    is_empty: !apiKey,
  };

  const sitekey = process.env.SUNO_HCAPTCHA_SITEKEY || 'd65453de-3f1a-4aac-9366-a0f06e52b2ce';
  const pageurl = process.env.SUNO_HCAPTCHA_PAGEURL || 'https://suno.com/create';
  const provider = (process.env.SUNO_CAPTCHA_PROVIDER || '2captcha').toLowerCase();
  const base = provider === 'rucaptcha' ? 'https://rucaptcha.com' : 'https://2captcha.com';

  const diagnostics: Record<string, unknown> = {
    key_info: keyInfo,
    config: { sitekey_prefix: sitekey.slice(0, 8), pageurl, provider, base },
  };

  // Test 1: getbalance on 2captcha.com
  try {
    const res = await axios.get(`${base}/res.php`, {
      params: { key: apiKey, action: 'getbalance', json: 1 },
      timeout: 15000,
    });
    diagnostics.balance_2captcha = { status: res.status, data: res.data };
  } catch (e: any) {
    diagnostics.balance_2captcha = { error: e?.message, response: e?.response?.data };
  }

  // Test 2: getbalance on rucaptcha.com (maybe account is there)
  try {
    const res = await axios.get('https://rucaptcha.com/res.php', {
      params: { key: apiKey, action: 'getbalance', json: 1 },
      timeout: 15000,
    });
    diagnostics.balance_rucaptcha = { status: res.status, data: res.data };
  } catch (e: any) {
    diagnostics.balance_rucaptcha = { error: e?.message, response: e?.response?.data };
  }

  // Test 3: submit hcaptcha task (don't poll, just see the submit response)
  try {
    const res = await axios.get(`${base}/in.php`, {
      params: {
        key: apiKey,
        method: 'hcaptcha',
        sitekey,
        pageurl,
        json: 1,
      },
      timeout: 15000,
    });
    diagnostics.submit_hcaptcha = { status: res.status, data: res.data };
  } catch (e: any) {
    diagnostics.submit_hcaptcha = { error: e?.message, response: e?.response?.data };
  }

  // Test 4: same but on rucaptcha
  try {
    const res = await axios.get('https://rucaptcha.com/in.php', {
      params: {
        key: apiKey,
        method: 'hcaptcha',
        sitekey,
        pageurl,
        json: 1,
      },
      timeout: 15000,
    });
    diagnostics.submit_hcaptcha_rucaptcha = { status: res.status, data: res.data };
  } catch (e: any) {
    diagnostics.submit_hcaptcha_rucaptcha = { error: e?.message, response: e?.response?.data };
  }

  return new NextResponse(JSON.stringify(diagnostics, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders });
}
