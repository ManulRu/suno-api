import { NextResponse, NextRequest } from "next/server";
import { cookies } from 'next/headers';
import { DEFAULT_MODEL, sunoApi } from "@/lib/SunoApi";
import { corsHeaders } from "@/lib/utils";
import { requireInternalToken } from "@/lib/requireInternalToken";
import { getRequestLogger } from "@/lib/withRequestId";

export const maxDuration = 60; // allow longer timeout for wait_audio == true
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authError = requireInternalToken(req);
  if (authError) return authError;
  const { logger: reqLogger, rid } = getRequestLogger(req);
  reqLogger.info({ event: 'request_start', route: '/api/custom_generate' });
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const { prompt, tags, title, make_instrumental, model, wait_audio, negative_tags } = body;
      const audioInfo = await (await sunoApi((await cookies()).toString())).custom_generate(
        prompt, tags, title,
        Boolean(make_instrumental),
        model || DEFAULT_MODEL,
        Boolean(wait_audio),
        negative_tags
      );
      reqLogger.info({ event: 'request_ok', route: '/api/custom_generate' });
      return new NextResponse(JSON.stringify(audioInfo), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
          'X-Request-ID': rid
        }
      });
    } catch (error: any) {
      reqLogger.error({ event: 'request_error', route: '/api/custom_generate', err: error?.message ?? String(error) });
      console.error('Error generating custom audio:', error);
      return new NextResponse(JSON.stringify({ error: error.response?.data?.detail || error.toString() }), {
        status: error.response?.status || 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
          'X-Request-ID': rid
        }
      });
    }
  } else {
    return new NextResponse('Method Not Allowed', {
      headers: {
        Allow: 'POST',
        ...corsHeaders
      },
      status: 405
    });
  }
}

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 200,
    headers: corsHeaders
  });
}
