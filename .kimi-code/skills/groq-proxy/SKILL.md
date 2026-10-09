---
name: groq-proxy
description: nume が Groq API をサーバーサイドでプロキシするフロー（SSE ストリーミング、レートリミット、エラーハンドリング）
type: inline
whenToUse: /api/reading、ストリーミング、LLM 呼び出し周りを変更する際
---

# Groq プロキシ

nume は Groq API（OpenAI 互換）をサーバーサイドでプロキシして利用する。

## フロー

1. ユーザーが生年月日を入力して「占う」（`src/components/islands/NumeApp.tsx`）
2. `src/pages/api/reading.ts` が `{ birthdate }` を受信（zod バリデーション → 400）
3. IP ベース レートリミット（12 req / 5 min、超過は 429）
4. `src/lib/numerology.ts` の `calcLifePath` でサーバー計算（LLM に計算させない。計算ロジックの正はサーバー側）
5. `src/lib/prompts.ts` のシステムプロンプト＋ユーザー情報を Groq `https://api.groq.com/openai/v1/chat/completions` に `stream: true` で送信
   - `max_tokens: 2048`、`temperature: 0.8`、`AbortSignal.timeout(45_000)`
6. Groq の SSE（`choices[0].delta.content`）をパースし、クライアントへ `data: {"text": "..."}` で転送。終了時は `event: done`
7. クライアントは ReadableStream で逐次描画

## エラーレスポンス

- 400: バリデーション失敗（`{ error: { code, message } }` 形式、`src/lib/api-response.ts`）
- 429: レートリミット超過
- 502: upstream（Groq）エラー
- 504: upstream タイムアウト（45s）

## レートリミット

- IP ベース 12 リクエスト / 5 分（`src/lib/rateLimit.ts`、isolate 内メモリ Map）
- なお dev（vite SSR）はリクエストごとにモジュール再読込のため 429 が発火しない。本番 Workers isolate で有効

## モデル

- コード上のデフォルト: `llama-3.3-70b-versatile`（`src/lib/prompts.ts` の `DEFAULT_MODEL` と `astro.config.mjs` の env schema）
- **注意**: このモデルは Groq から退役済み。実際の稼働には `wrangler secret put LLM_MODEL`（ローカルは `.dev.vars`）で利用可能なモデルを設定すること（例: `openai/gpt-oss-120b`）
- 利用可能モデルは `GET https://api.groq.com/openai/v1/models` で確認できる

## セキュリティ

- `GROQ_API_KEY` は `astro:env/server`（server/secret）経由のみ。クライアントに絶対漏らさない
- `LLM_MODEL` も `astro:env/server`。クライアント側 env は `PUBLIC_` プレフィックスの `PUBLIC_SITE_URL` のみ
