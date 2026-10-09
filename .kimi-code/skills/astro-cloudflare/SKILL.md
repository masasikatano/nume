---
name: astro-cloudflare
description: nume の実行環境である Astro 6 + React Islands + Cloudflare Workers スタックに関する知識
type: inline
whenToUse: nume のコードを変更・追加・デバッグする際、ビルド設定やディレクトリ構成に触れる際
---

# Astro + Cloudflare Workers スタック

nume の実行環境に関する知識。

## Astro 6

- Islands アーキテクチャ：デフォルトで静的 HTML、必要な部分のみ JS ハイドレーション
- API エンドポイントは `src/pages/api/reading.ts` で定義
- `astro.config.mjs` でアダプタ設定（`@astrojs/cloudflare`）
- `site` は `https://nume.scryer.workers.dev`、`trailingSlash: 'never'`

## React 19 Islands

- インタラクティブコンポーネントは `src/components/islands/NumeApp.tsx`（単一 island）
- トップページでは `<NumeApp client:only="react" />` でマウント
- `client:*` ディレクティブでハイドレーションを制御

## Cloudflare Workers

- `wrangler.toml` で設定（`name = "nume"`、`workers_dev = true`、`preview_urls = true`、`[observability] enabled = true`）
- `npm run deploy` で Workers へデプロイ
- 環境変数は `wrangler secret put` で設定（GROQ_API_KEY / LLM_MODEL）
- PUBLIC vars は wrangler.toml の `[vars] PUBLIC_SITE_URL`

## 注意点

- `vite` は Astro 6 との互換性のため `^7.3.5` に固定（`package.json` の `overrides`）
- `npm run check`（astro check）を必ず実行
- SEO/AIO 用の静的ページ（`/numbers/[n]`、`/about`、`/faq`、トップ）は `export const prerender = true` で事前レンダリングする
- `astro.config.mjs` では `@astrojs/sitemap` を有効化（`/api/` は除外フィルタ済み）
- ビルド時（`prebuild`）に `scripts/generate-assets.mjs` で OGP/アイコン画像が生成される。手動編集しない
- ローカル dev で Groq を呼ぶには `.dev.vars` に `GROQ_API_KEY` が必要
