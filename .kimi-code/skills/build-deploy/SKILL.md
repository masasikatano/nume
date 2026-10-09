---
name: build-deploy
description: nume の型チェック・ビルド・Cloudflare Workers デプロイ手順（手動呼び出し専用）
type: flow
whenToUse: ユーザーが明示的にビルド・デプロイ・リリースを依頼したときのみ
---

# ビルドとデプロイ

## 型チェックとビルド（必須）

```bash
npm run check
npm run build
```

- `npm run check`（astro check）は必ず実行し、エラーがあれば修正して再実行する
- `npm run build` の `prebuild` で `scripts/generate-assets.mjs` が OGP/アイコン画像を自動生成する。手動変更は不要
- エラーが残ったままデプロイしてはいけない

## デプロイ

```bash
npm run deploy
```

- `npm run build` + `wrangler deploy`。本番は `https://nume.<subdomain>.workers.dev`
- ビルド時にサイトマップ（`sitemap-index.xml`）、OGP/アイコン、prerender ページ（`/numbers/[n]`、`/about`、`/faq`）も生成・含まれる
- 本番公開後は Google Search Console でインデックス状況を確認する

## 本番シークレット

```bash
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put LLM_MODEL   # 任意
```

- **`LLM_MODEL` 注意**: コードのデフォルト `llama-3.3-70b-versatile` は Groq から退役済み。`GET https://api.groq.com/openai/v1/models` でアカウントの利用可能モデルを確認し、設定すること（例: `openai/gpt-oss-120b`）
- シークレット未設定のままデプロイすると `/api/reading` が Groq 呼び出し前に 502 を返す

## 関連ドキュメント

- 詳細な Workers 設定・カスタムドメイン・オブザーバビリティ: `README_cloudflare.md`
- アーキテクチャ: `architecture.md`
