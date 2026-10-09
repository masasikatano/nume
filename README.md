# nume

生年月日を入力するとライフパスナンバー（1〜9）を算出し、Groq 駆動のパーソナライズ占いをストリーミングで返す数秘術占い Web サービス。

**Astro 6 + React 19 Islands + Tailwind 4 + Cloudflare Workers + Groq ストリーミング**

- **UI**: ライトモード、携帯特化。生年月日（`<input type="date">`）を入力するだけ
- **計算**: 生年月日の全桁を合計して一桁に還元（マスターナンバーは非採用）。クライアント/サーバーで同一の純関数 `src/lib/numerology.ts` を共有
- **解説**: ナンバーの意味・性格・強み・恋愛・仕事・使命を語る温かい数秘術師のトーン（800〜1200字、末尾に免責文）
- **LLM**: Groq（OpenAI 互換 API、`stream: true`）をサーバーサイドでプロキシし、`delta.content` を SSE でクライアントへ転送
- **レートリミット**: IP ベース（12リクエスト / 5分）

## 開発

```bash
cp .env.example .env        # GROQ_API_KEY を設定
cp .dev.vars.example .dev.vars  # ローカル Worker ランタイム用（dev で Groq を呼ぶ場合に必要）
npm install
npm run check               # 必須（astro check）
npm run dev                 # http://localhost:4321
npm run build               # prebuild（OGP/アイコン生成）+ astro check + astro build
npm run deploy              # build + wrangler deploy
```

**本番シークレット設定**

```bash
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put LLM_MODEL   # 任意
npm run deploy
```

> **注意**: `llama-3.3-70b-versatile` は Groq から退役済みです。利用可能なモデル名を `LLM_MODEL` に設定してください（例: `openai/gpt-oss-120b`）。`GET https://api.groq.com/openai/v1/models` でアカウントで使えるモデル一覧を確認できます。

## ローカルでの確認

`npm run dev` で http://localhost:4321 が起動します。

**ブラウザで確認**

- `/`: 生年月日を入力して「占う」→ ライフパスナンバーが先に表示され、その下に Groq からの解説がストリーミングでフェードインします
- `/numbers/1` 〜 `/numbers/9`: ナンバー解説ページ
- `/about`、`/faq`

**API を curl で確認**

```bash
# 正常系: SSE ストリーム（data: {"text": ...} の連続 + event: done）が返る
curl -N -X POST http://localhost:4321/api/reading \
  -H 'Content-Type: application/json' \
  -d '{"birthdate":"1985-04-23"}'        # ライフパスナンバーは 5

# 異常系: 不正な日付は 400
curl -X POST http://localhost:4321/api/reading \
  -H 'Content-Type: application/json' \
  -d '{"birthdate":"2020-02-30"}'
```

**計算ロジックの確認**

```bash
npx tsx -e "import { calcLifePath, isValidBirthdate } from './src/lib/numerology.ts'; \
console.log(calcLifePath('1985-04-23'));  // 5 \
console.log(isValidBirthdate('2000-01-01'));"
```

**注意**

- dev サーバは `.dev.vars`（または `.env`）の `GROQ_API_KEY` を使用します。未設定の場合、バリデーション・レートリミットまでは動作しますが、Groq 呼び出しはエラー（502）になります
- dev の vite は毎リクエストでモジュールを再読み込むため、レートリミット（429）は発火しません。429 の挙動は本番 Workers 環境で確認してください
- 本番ビルドの確認: `npm run build && npm run preview`

## ディレクトリ構成

```
src/
  layouts/Layout.astro
  pages/index.astro          # 占いフォーム（island）
  pages/numbers/[n].astro    # ナンバー解説ページ ×9（prerender）
  pages/about.astro          # サービス・数秘術紹介ページ
  pages/faq.astro            # FAQ ページ（FAQPage JSON-LD）
  pages/api/reading.ts       # Groq プロキシ API（SSE ストリーミング）
  components/islands/
    NumeApp.tsx              # フォーム＋結果ストリーミング表示
  lib/
    numerology.ts            # ライフパス計算・日付バリデーション（純関数）
    numberData.ts            # ナンバー1〜9のコンテンツ
    prompts.ts               # システムプロンプト
    rateLimit.ts             # IP ベース レートリミット（12 req / 5 min）
    api-response.ts
  styles/global.css

public/
  ogp-default.png            # デフォルト OGP 画像（ビルド時生成）
  apple-touch-icon.png       # ホーム画面アイコン（ビルド時生成）
  icon-192.png
  icon-512.png
  favicon.svg
  robots.txt
  manifest.json

scripts/
  generate-assets.mjs        # OGP / アイコン画像生成（prebuild で実行）

wrangler.toml
astro.config.mjs
```

## SEO / AIO

- **静的コンテンツ**: `/numbers/1` 〜 `/numbers/9`、`/about`、`/faq` を prerender 生成
- **メタ情報**: `src/layouts/Layout.astro` で title / description / canonical / OGP / Twitter Card / JSON-LD（WebSite / WebApplication / Article / FAQPage）を一元管理
- **サイトマップ**: `@astrojs/sitemap` により `dist/client/sitemap-index.xml` を自動生成
- **生成アセット**: `npm run build` の `prebuild` で OGP 画像・アイコンを自動生成

## 注意事項

- この結果はエンターテインメント・内省のきっかけであり、専門的な助言（医療・法律・金融など）ではありません
- レートリミット、OGP/アイコン生成、SEO/AIO 構成は姉妹プロジェクトの TarotScryer（tarot）から流用しています
- `vite` は Astro 6 との互換性のため `^7.3.5` に固定（`package.json` の `overrides` を参照）

## Cloudflare デプロイの詳細

Cloudflare Workers へのデプロイ手順・カスタムドメイン設定・オブザーバビリティについては [README_cloudflare.md](./README_cloudflare.md) を参照してください。
