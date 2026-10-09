import type { APIRoute } from 'astro';
import { z } from 'zod';
import { jsonResponse } from '@/lib/api-response';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { calcLifePath, calcCompatibility, isValidBirthdate } from '@/lib/numerology';
import { getSystemPrompt, buildUserPrompt, getCompatibilitySystemPrompt, buildCompatibilityUserPrompt, DEFAULT_MODEL } from '@/lib/prompts';
import { GROQ_API_KEY, LLM_MODEL } from 'astro:env/server';

const BodySchema = z.object({
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  birthdate2: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 45_000;
const RATE_LIMIT = 12;
const RATE_WINDOW_MS = 5 * 60 * 1000;

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
};

function sseText(text: string): string {
  return `data: ${JSON.stringify({ text })}\n\n`;
}

/**
 * Groq の SSE ストリームを読み、delta.content をクライアント向け SSE に変換しながら転送する。
 */
async function pipeGroqStream(
  upstream: ReadableStream<Uint8Array>,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
): Promise<void> {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const send = (payload: string) => {
    controller.enqueue(encoder.encode(payload));
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          send('event: done\n\n');
          return;
        }
        try {
          const json = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            send(sseText(content));
          }
        } catch {
          // 部分的な JSON は次のチャンクに持ち越す（無視）
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);

  if (!checkRateLimit(ip, RATE_LIMIT, RATE_WINDOW_MS)) {
    return jsonResponse(
      { error: { code: 'RATE_LIMITED', message: 'レート制限を超えました。しばらく経ってからお試しください。' } },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      { error: { code: 'BAD_REQUEST', message: 'リクエストの形式が正しくありません。' } },
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success || !isValidBirthdate(parsed.data.birthdate)) {
    return jsonResponse(
      { error: { code: 'BAD_REQUEST', message: '生年月日が正しくありません。1900年1月1日以降の日付を入力してください。' } },
      { status: 400 },
    );
  }

  const { birthdate, birthdate2 } = parsed.data;
  const isCompat = birthdate2 !== undefined;
  if (isCompat && !isValidBirthdate(birthdate2)) {
    return jsonResponse(
      { error: { code: 'BAD_REQUEST', message: '2人目の生年月日が正しくありません。1900年1月1日以降の日付を入力してください。' } },
      { status: 400 },
    );
  }

  const lifePath = calcLifePath(birthdate);
  const lifePath2 = isCompat ? calcLifePath(birthdate2) : null;
  const score = isCompat && lifePath2 !== null ? calcCompatibility(lifePath, lifePath2) : null;
  const apiKey = GROQ_API_KEY;

  if (!apiKey) {
    console.error('GROQ_API_KEY is not configured');
    return jsonResponse(
      { error: { code: 'UPSTREAM_ERROR', message: 'サーバーの準備ができていません。しばらくしてからお試しください。' } },
      { status: 502 },
    );
  }

  const model = LLM_MODEL || DEFAULT_MODEL;

  const messages = isCompat && lifePath2 !== null && score !== null
    ? [
        { role: 'system' as const, content: getCompatibilitySystemPrompt() },
        { role: 'user' as const, content: buildCompatibilityUserPrompt(birthdate, lifePath, birthdate2, lifePath2, score) },
      ]
    : [
        { role: 'system' as const, content: getSystemPrompt() },
        { role: 'user' as const, content: buildUserPrompt(birthdate, lifePath) },
      ];

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.8,
        max_tokens: 2048,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err: unknown) {
    const error = err as { name?: string; message?: string };
    console.error('Groq fetch error', { name: error?.name, message: error?.message, model });
    const status = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 504 : 502;
    const message =
      status === 504
        ? '解説の生成が時間内に終わりませんでした。もう一度お試しください。'
        : '解説の生成に失敗しました。少し待ってからもう一度お試しください。';
    return jsonResponse({ error: { code: status === 504 ? 'TIMEOUT' : 'UPSTREAM_ERROR', message } }, { status });
  }

  if (!upstreamRes.ok || !upstreamRes.body) {
    const errorText = await upstreamRes.text().catch(() => '');
    console.error('Groq upstream error', {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      body: errorText.slice(0, 500),
      model,
    });
    return jsonResponse(
      { error: { code: 'UPSTREAM_ERROR', message: '解説の生成に失敗しました。少し待ってからもう一度お試しください。' } },
      { status: 502 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (isCompat && lifePath2 !== null && score !== null) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'compat', n1: lifePath, n2: lifePath2, score })}\n\n`,
            ),
          );
        }
        await pipeGroqStream(upstreamRes.body as ReadableStream<Uint8Array>, controller, encoder);
      } catch (err: unknown) {
        console.error('Stream pipe error', err);
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: { code: 'STREAM_ERROR', message: '通信が中断されました。' } })}\n\n`));
        } catch {
          // controller already closed
        }
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      upstreamRes.body?.cancel().catch(() => {});
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
};
