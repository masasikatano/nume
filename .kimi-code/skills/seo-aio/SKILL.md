---
name: seo-aio
description: nume の検索エンジン最適化（SEO）と生成 AI 検索での被引用性向上（AIO/GEO）の方針
type: inline
whenToUse: ページ追加・メタ情報・構造化データ・生成アセットに関わる変更をする際
---

# nume SEO / AIO

nume の検索エンジン最適化（SEO）と、生成 AI / LLM 検索における被引用性向上（AIO / GEO）に関するスキル。

## 基本方針

- **SEO**: 検索エンジンに読み取れる静的コンテンツを増やし、メタ情報・サイトマップ・構造化データを整備する。
- **AIO**: ナンバーの事実情報、FAQ、傾向の解釈を明確に構造化し、LLM が引用・参照しやすいコンテンツを提供する。

## 主要ファイル

| ファイル | 役割 |
|---------|------|
| `src/layouts/Layout.astro` | title / description / canonical / OGP / Twitter Card / JSON-LD の出力 |
| `src/pages/numbers/[n].astro` | ナンバー解説ページ ×9（`getStaticPaths` で prerender、`Article` JSON-LD） |
| `src/pages/about.astro` | サービス・数秘術紹介ページ |
| `src/pages/faq.astro` | FAQ ページ（`FAQPage` JSON-LD） |
| `src/lib/numberData.ts` | ナンバー解説コンテンツの正（手書き） |
| `public/robots.txt` | クローラー制御（`/api/` を disallow） |
| `astro.config.mjs` | `trailingSlash: 'never'`、`@astrojs/sitemap` 設定 |
| `scripts/generate-assets.mjs` | OGP / アイコン画像の生成（`prebuild` で実行） |

## 実装ルール

1. **メタ情報は Layout に集約**
   - 各ページで `<Layout title="..." description="..." canonical={...} ldJson={...}>` のように渡す。
   - canonical / OGP の基底 URL は `astro.config.mjs` の `site`（`PUBLIC_SITE_URL`）ベース。

2. **静的ページは prerender**
   - SEO/AIO 対象ページの先頭に `export const prerender = true;` を必ず書く。
   - API ルート（`/api/reading`）は prerender しない。

3. **構造化データ**
   - 全ページ共通で `WebSite` JSON-LD を出力。
   - トップページは `WebApplication`、ナンバーページは `Article`、FAQ ページは `FAQPage` を追加する。

4. **生成アセットはビルド時に作る**
   - `public/ogp-default.png`、アイコン類は `scripts/generate-assets.mjs` で生成する。
   - 手動で画像編集しない。変更が必要ならスクリプトを修正する。

5. **新規ページ追加時のチェックリスト**
   - [ ] `export const prerender = true;` を付与
   - [ ] `title` / `description` を設定
   - [ ] 必要に応じて `ldJson` を設定
   - [ ] パンくずリストや内部リンクを配置
   - [ ] `npm run check && npm run build` が通ることを確認
   - [ ] `dist/client/sitemap-*.xml` に含まれることを確認

## 注意事項

- 占い結果は URL を持たないクライアント状態のため、検索インデックス対象外。問題ない。
- 「エンターテインメント・内省のきっかけであり、専門的な助言ではない」という免責を各ページで維持する。
- カスタムドメインを使う場合は `PUBLIC_SITE_URL` と `astro.config.mjs` の `site` を両方変更する。
