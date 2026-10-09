# nume アーキテクチャ

## 概要

生年月日を入力するとライフパスナンバー（1〜9）を算出し、Groq 駆動のパーソナライズ占いをストリーミングで返す数秘術占い Web サービス。

**スタック**: Astro 6 + React 19 Islands + Tailwind 4 + Cloudflare Workers + Groq ストリーミング

## システム構成図

```
┌─────────────────────────────────────┐
│           クライアント               │
│  ┌─────────────────────────────┐    │
│  │  React 19 Island            │    │
│  │  - NumeApp.tsx              │    │
│  │    生年月日入力フォーム      │    │
│  │    ライフパス大表示          │    │
│  │    SSE ストリーミング描画    │    │
│  └─────────────────────────────┘    │
└──────────────┬──────────────────────┘
               │ POST /api/reading { birthdate }
               ▼
┌─────────────────────────────────────┐
│      Cloudflare Workers (Astro)      │
│  ┌─────────────────────────────┐    │
│  │  src/pages/api/reading.ts   │    │
│  │  - zod バリデーション (400)  │    │
│  │  - レートリミット (429)      │    │
│  │  - calcLifePath サーバー計算 │    │
│  │  - Groq stream:true プロキシ │    │
│  │  - delta.content → SSE 転送  │    │
│  └─────────────────────────────┘    │
└──────────────┬──────────────────────┘
               │ SSE (stream: true)
               ▼
┌─────────────────────────────────────┐
│           Groq API                   │
│  https://api.groq.com/openai/v1/...  │
│  (OpenAI 互換、LLM_MODEL で指定)     │
└─────────────────────────────────────┘
```

## 主要コンポーネント

### フロントエンド

- `src/layouts/Layout.astro`：ベースレイアウト（meta / OGP / JSON-LD 一元管理）
- `src/pages/index.astro`：トップページ（`<NumeApp client:only="react" />`）
- `src/components/islands/NumeApp.tsx`：フォーム＋結果表示を担う単一の island
  - `<input type="date">`（min=1900-01-01、max=当日）で生年月日を入力
  - 送信直後にクライアント側 `calcLifePath` でナンバー＋キーワードを大表示
  - `/api/reading` の SSE（`data: {"text": ...}` / `event: done`）を ReadableStream で読み取り逐次表示
  - 段落単位のフェードイン、断絶時リトライ、完了後「もう一度占う」+ `/numbers/{n}` リンク
  - 結果エリア下部に免責文を常時表示

### バックエンド

- `src/pages/api/reading.ts`：Groq プロキシ API
  - zod で `{ birthdate }` バリデーション → 400
  - IP ベース レートリミット（12 req / 5 min）→ 429
  - `calcLifePath` でサーバー計算（LLM に計算させない）
  - Groq に `stream: true`、`max_tokens: 2048`、`temperature: 0.8`、`AbortSignal.timeout(45_000)`
  - Groq の SSE（`choices[0].delta.content`）をパースし `data: {"text": ...}` で転送、終了時 `event: done`
  - upstream エラー 502 / タイムアウト 504
- `src/lib/numerology.ts`：`calcLifePath` / `isValidBirthdate` の純関数（クライアント/サーバー共用）
- `src/lib/prompts.ts`：数秘術師のシステムプロンプト（出力構成・禁止事項・末尾免責）
- `src/lib/numberData.ts`：ナンバー1〜9のキーワード・意味・特徴などのコンテンツ（LLM 不使用）
- `src/lib/rateLimit.ts`：IP ベース レートリミット（isolate 内メモリ Map）
- `src/lib/api-response.ts`：`{ error: { code, message } }` 形式の JSON レスポンス

### 静的ページ（prerender）

- `src/pages/numbers/[n].astro`：ライフパスナンバー 1〜9 の解説ページ（`getStaticPaths`、`Article` JSON-LD）
- `src/pages/about.astro`：サービス・数秘術紹介
- `src/pages/faq.astro`：FAQ（`FAQPage` JSON-LD）

## データフロー

1. ユーザーが生年月日を入力して「占う」
2. クライアントが `calcLifePath` でナンバーを算出し大表示（即時フィードバック）
3. `POST /api/reading` を送信。サーバーでバリデーション → レートリミット → サーバー側でも `calcLifePath` を実行
4. Groq API にシステムプロンプト＋ユーザー情報を `stream: true` で送信
5. `delta.content` を SSE でクライアントへ転送（`data: {"text": ...}`、完了時 `event: done`）
6. 段落単位でフェードインしながら解説を表示。完了後はリトライ/もう一度占う導線

## セキュリティとレート制限

- `GROQ_API_KEY` は `astro:env/server`（server/secret）でサーバーサイドのみ保持。クライアントには一切出さない
- IP ベースのレートリミット（12 req / 5 min）でコストと濫用を抑制
- 本番環境では `wrangler secret put GROQ_API_KEY` / `LLM_MODEL` で機密情報を設定
- 日付バリデーション: 1900-01-01 〜 当日のみ受付（不成立は 400）

## SEO / AIO アーキテクチャ

検索エンジンと生成 AI の両方に discoverable な構成。

### 静的ページ（prerender）

| ページ | 内容 | JSON-LD |
|--------|------|---------|
| `/` | トップ / 占いアプリ | `WebApplication` |
| `/numbers/[n]` | ナンバー解説 ×9 | `Article` |
| `/about` | サービス・数秘術の解説・免責 | — |
| `/faq` | よくある質問 | `FAQPage` |

### メタ情報

- `src/layouts/Layout.astro` で title / description / canonical / OGP / Twitter Card / `WebSite` JSON-LD を一元管理
- 各ページは props でメタ情報を上書き可能。canonical / OGP の基底 URL は `astro.config.mjs` の `site`（`PUBLIC_SITE_URL`）ベース

### サイトマップとクローラー制御

- `@astrojs/sitemap` で `sitemap-index.xml` を自動生成（`/api/` は除外）
- `public/robots.txt` で `/api/` を disallow
- `trailingSlash: 'never'` で URL を統一

### 生成アセット

ビルド時（`prebuild` の `scripts/generate-assets.mjs`）に生成されるアセット:

- `public/ogp-default.png`
- `public/apple-touch-icon.png`
- `public/icon-192.png`
- `public/icon-512.png`

## デプロイ

- `npm run build` で `astro check` + Astro のビルド（静的ファイル + Workers 用アセット）を生成
- `npm run deploy` で Cloudflare Workers にデプロイ
- 詳細は `README_cloudflare.md` を参照
