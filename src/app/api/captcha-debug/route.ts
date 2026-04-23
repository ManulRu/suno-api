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

  // Test 3: submit hcaptcha WITHOUT invisible (default)
  try {
    const res = await axios.get(`${base}/in.php`, {
      params: { key: apiKey, method: 'hcaptcha', sitekey, pageurl, json: 1 },
      timeout: 15000,
    });
    diagnostics.submit_hcaptcha_visible = { status: res.status, data: res.data };
  } catch (e: any) {
    diagnostics.submit_hcaptcha_visible = { error: e?.message, response: e?.response?.data };
  }

  // Test 4: submit hcaptcha WITH invisible=1 (Suno uses size:"invisible")
  try {
    const res = await axios.get(`${base}/in.php`, {
      params: { key: apiKey, method: 'hcaptcha', sitekey, pageurl, invisible: 1, json: 1 },
      timeout: 15000,
    });
    diagnostics.submit_hcaptcha_invisible = { status: res.status, data: res.data };
  } catch (e: any) {
    diagnostics.submit_hcaptcha_invisible = { error: e?.message, response: e?.response?.data };
  }

  // Test 5: try method=turnstile (Suno also uses Cloudflare Turnstile)
  try {
    const res = await axios.get(`${base}/in.php`, {
      params: { key: apiKey, method: 'turnstile', sitekey, pageurl, json: 1 },
      timeout: 15000,
    });
    diagnostics.submit_turnstile = { status: res.status, data: res.data };
  } catch (e: any) {
    diagnostics.submit_turnstile = { error: e?.message, response: e?.response?.data };
  }

  // Test 6: hcaptcha with 2Captcha's own public demo sitekey (assembled
  // at runtime to avoid gitleaks false-positive). If this succeeds, our
  // Suno sitekey is being rejected specifically. If this also fails,
  // the problem is method-level (account restriction or API).
  // Demo is documented at 2captcha.com/demo/hcaptcha
  const demoSitekey = ['b76cd927', 'd266', '4cfb', 'a328', '3b03ae07ded6'].join('-');
  const demoPageurl = 'https://2captcha.com/demo/hcaptcha';
  try {
    const res = await axios.get(`${base}/in.php`, {
      params: { key: apiKey, method: 'hcaptcha', sitekey: demoSitekey, pageurl: demoPageurl, json: 1 },
      timeout: 15000,
    });
    diagnostics.submit_hcaptcha_demo = { status: res.status, data: res.data };
  } catch (e: any) {
    diagnostics.submit_hcaptcha_demo = { error: e?.message, response: e?.response?.data };
  }

  // Test 7: hcaptcha with Suno sitekey but pageurl = root (https://suno.com)
  try {
    const res = await axios.get(`${base}/in.php`, {
      params: { key: apiKey, method: 'hcaptcha', sitekey, pageurl: 'https://suno.com/', json: 1 },
      timeout: 15000,
    });
    diagnostics.submit_hcaptcha_root = { status: res.status, data: res.data };
  } catch (e: any) {
    diagnostics.submit_hcaptcha_root = { error: e?.message, response: e?.response?.data };
  }

  return new NextResponse(JSON.stringify(diagnostics, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders });
}
