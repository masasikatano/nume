# nume — Cloudflare Workers デプロイ手順

このドキュメントでは、nume を Cloudflare Workers へデプロイする手順を説明します。nume は **Cloudflare Pages ではなく Workers** としてデプロイされます（Astro の `@astrojs/cloudflare` アダプタにより、SSR と静的アセットの両方が 1 つの Worker として配信されます）。

## 前提

- Cloudflare アカウント（無料枠で可）
- Node.js >= 22.12.0
- Wrangler のバージョンは `package.json` の devDependencies（`wrangler ~4.101.0`）に従います

## 1. Wrangler ログイン

```bash
npx wrangler login
```

ブラウザが開いて Cloudflare アカウントとの認可を行います。CI など非対話環境では `CLOUDFLARE_API_TOKEN` 環境変数を利用してください。

## 2. 本番シークレットの設定

API キーは `wrangler secret put` で暗号化されて Workers に保存されます（`wrangler.toml` には書きません）。

```bash
npx wrangler secret put GROQ_API_KEY
# プロンプトが表示されたら Groq API キーを貼り付け

npx wrangler secret put LLM_MODEL
# 任意。利用可能なモデル名を入力（例: openai/gpt-oss-20b）
```

> **注意**: コード上のデフォルト値 `llama-3.3-70b-versatile` は Groq から退役済みのため、`LLM_MODEL` には利用可能なモデル名を設定してください（`GET https://api.groq.com/openai/v1/models` で一覧を確認できます）。

## 3. wrangler.toml の説明

```toml
name = "nume"                      # Cloudflare 上の Worker 名
compatibility_date = "2026-06-18"  # Workers ランタイムの互換性日付
workers_dev = true                 # <name>.<subdomain>.workers.dev で公開
preview_urls = true                # プレビューデプロイ用 URL を有効化

[vars]
PUBLIC_SITE_URL = "https://nume.scryer.workers.dev"  # canonical / OGP / sitemap の基底 URL

[observability]
enabled = true                     # ログ・メトリクスの収集を有効化
```

## 4. デプロイ

```bash
npm run deploy
```

`npm run build`（`prebuild` で OGP/アイコン生成 → `astro check` → `astro build`）の後、`wrangler deploy` が実行され、`https://nume.<あなたのsubdomain>.workers.dev` に公開されます。

## 5. カスタムドメインの設定（任意）

ドメインが Cloudflare に追加（ネームサーバー委譲または CNAME セットアップ）されていることが前提です。

### 方法 A: wrangler.toml で Custom Domain を宣言（推奨）

```toml
routes = [
  { pattern = "nume.example.com", custom_domain = true },
]
```

`custom_domain = true` を付けて `npm run deploy` すると、Cloudflare が DNS レコードと SSL 証明書を自動作成し、そのホスト名で Worker が応答します。既存サイトのパス配下だけを Worker に振りたい場合（Workers Route）は `zone_name` 付きのパターン（例: `{ pattern = "example.com/nume/*", zone_name = "example.com" }`）を使います。

### 方法 B: Cloudflare ダッシュボードから設定

1. ダッシュボード → **Workers & Pages** → `nume` を選択
2. **Settings** → **Domains & Routes** → **Add** → **Custom Domain** にドメインを入力
3. DNS レコード・SSL は自動でプロビジョニングされます

### PUBLIC_SITE_URL の更新（必須）

カスタムドメインを使う場合は、`wrangler.toml` の `[vars] PUBLIC_SITE_URL` をそのドメインに合わせて変更してからデプロイし直してください。この値は `astro.config.mjs` の `site` とともに、canonical URL・OGP 画像 URL・sitemap の基底 URL として使われます。サイト側の URL（`https://nume.scryer.workers.dev`）と実際の公開 URL が一致しないと、OGP や sitemap が正しく機能しません。

## 6. プレビューデプロイ

`preview_urls = true` の場合、`git` ベースのバージョニングで `wrangler deploy`（または `wrangler versions upload` + バージョンアクティベート）を行うと、本番 URL に影響を与えずに検証できるプレビュー URL（`https://<バージョン>.nume.<subdomain>.workers.dev` 形式）が発行されます。通常の `npm run deploy` は本番へ直接反映されます。

## 7. ローカル開発

```bash
cp .dev.vars.example .dev.vars   # GROQ_API_KEY（任意で LLM_MODEL）を記入
npm run dev
```

`astro dev` は `.dev.vars` を読み込み、ローカルの Worker ランタイム（`.env` も併用）にシークレットを提供します。`.dev.vars` がない場合、API（`/api/reading`）は Groq 呼び出し前に 502 を返します。

## 8. ログとオブザーバビリティ

`wrangler.toml` で `[observability] enabled = true` になっているため、ログとメトリクスが収集されます。

- **リアルタイムログ**: `npx wrangler tail nume`
- **ダッシュボード**: **Workers & Pages** → `nume` → **Logs** で履歴ログ・メトリクスを確認できます
