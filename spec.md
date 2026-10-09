# nume — 数秘術ライフパスナンバー占いサービス spec

生年月日を入力するとライフパスナンバー（1〜9）を算出し、Groq 駆動のパーソナライズ占いをストリーミング返す Web サービス。
参照実装: `/home/masasikatano/project/tarot/`（Astro + Cloudflare Workers + LLM プロキシ）。本 spec は tarot からの差分を中心に記述する。

## 1. サービス概要

- **目的**: ユーザーが生年月日を入力するだけで、ライフパスナンバーとそのパーソナライズされた占い解説を受け取れる娯楽・内省サービス。
- **トーン**: tarot の MOL（Method of Levels）系ではなく、数秘術らしい「運命の傾向・強み・使命」を語る親しみやすい占い師調。決断を迫らず、前向きに自分を語るきっかけを与える。
- **免責**: 結果はエンターテインメント・内省のきっかけであり、専門的な助言（医療・法律・金融など）ではないことを画面と LLM 出力の末尾に明記。

## 2. アーキテクチャ

- **Astro 6 + React 19 Islands + Tailwind 4 + Cloudflare Workers**（`@astrojs/cloudflare`）。
- **LLM**: OpenRouter ではなく **Groq**（`https://api.groq.com/openai/v1/chat/completions`、OpenAI 互換 API）をサーバーサイドでプロキシ。API キーはクライアントに一切出さない。
- tarot のビルドパイプライン（`astro check` + `astro build` + `wrangler deploy`、vite `^7.3.5` 固定オーバーライド）を流用。

### ディレクトリ構成（予定）

```
nume/
  .env                  # GROQ_API_KEY, PUBLIC_SITE_URL（ローカル dev 用、git 管理外）
  .dev.vars             # ローカル Worker ランタイム用（GROQ_API_KEY 等）
  wrangler.toml
  astro.config.mjs
  package.json
  src/
    layouts/Layout.astro
    pages/index.astro          # 占いフォーム（island）
    pages/numbers/[n].astro    # ナンバー解説ページ ×9（prerender）
    pages/about.astro
    pages/faq.astro
    pages/api/reading.ts       # Groq プロキシ API
    components/islands/NumeApp.tsx      # フォーム＋結果表示
    lib/numerology.ts          # ライフパス計算（純関数）
    lib/prompts.ts             # システムプロンプト
    lib/rateLimit.ts           # IP ベース（tarot 流用）
    lib/api-response.ts
    styles/global.css
  scripts/
    generate-assets.mjs        # OGP / アイコン生成（tarot 流用）
  public/
    ogp-default.png / icon-*.png / favicon.svg / robots.txt / manifest.json
```

## 3. 数秘術計算ルール

- 生年月日 `YYYY-MM-DD` の**全桁を合計**し、1〜9 の一桁に還元する。
- **マスターナンバー（11/22/33）は採用しない**（途中で出ても最後まで還元する）。
- 計算例: 1985-04-23 → 1+9+8+5+0+4+2+3 = 32 → 3+2 = **5**。
- クライアント（結果表示用）とサーバ（プロンプト用）で同じ純関数 `calcLifePath(date: string): number`（`src/lib/numerology.ts`）を使い、計算ロジックの二重実装を防ぐ。
- バリデーション: 日付として有効な範囲（1900-01-01 〜 当日）のみ受け付ける。不成立なら 400。

## 4. 画面設計

1. **トップ（`/`）**: サービスの一言説明 + 生年月日入力（`<input type="date">`）+ 「占う」ボタン。携帯特化・ライトモード（tarot 準拠）。
2. **結果表示**: まずライフパスナンバー（大きな数字 + 一言キーワード）を即表示し、その下に Groq からの解説をストリーミング表示（段落単位でフェードイン）。読み終わった後に「もう一度占う」とナンバー解説ページ（`/numbers/{n}`）への導線。
3. **免責**: 結果エリア下部に常時表示。

## 5. API 設計

- `POST /api/reading`
- リクエスト: `{ "birthdate": "1985-04-23" }`（zod でバリデーション。不正は 400）
- 認証・キー管理: サーバー側の `GROQ_API_KEY`（`astro:env/server` 経由、`wrangler secret put`）のみ。
- **レートリミット**: IP ベース 12 リクエスト / 5 分（tarot の `rateLimit.ts` を流用）。超過は 429。
- **レスポンス**: SSE ストリーミング。Groq の `stream: true` の `delta.content` をそのまま転送し、クライアントで逐次レンダリング。終端イベントで完了を通知。
- エラーレスポンス: `{ error: { code, message } }`（400 / 429 / 502 upstream / 504 timeout）。クライアントは途中断絶時にリトライボタンを表示。
- タイムアウト: upstream fetch 45s（tarot 準拠）。

## 6. LLM 設計

- **プロバイダ**: Groq（OpenAI 互換）。base: `https://api.groq.com/openai/v1/chat/completions`
- **モデル**: デフォルト `llama-3.3-70b-versatile`（`LLM_MODEL` env/secret で上書き可能）。
- **ストリーミング**: `stream: true` でテキスト全文を生成。tarot の JSON schema 検証方式とは異なり、数秘術は単一ナンバーの散文でよいためシンプルなテキストストリームとする。
- **システムプロンプト方針**（`src/lib/prompts.ts`）:
  - 役割: 数秘術の占い師。温かく、押し付けがましくなく、ユーザーの強みと可能性を語る。
  - 入力情報: 生年月日と算出済みライフパスナンバー（計算はサーバー側が正とし、LLM に計算させない）。
  - 出力構成の目安: ① ナンバーの意味 ② その人の性格・強み ③ 恋愛・対人関係の傾向 ④ 仕事・使命 ⑤ 今の段階で意識したいこと。800〜1200 字程度。
  - 禁止事項: 病気・死期・金額の予言、専門助言への踏み込み、決定的な表現（「必ず」「運命だ」等）。
  - 末尾に免責文を含めるよう指示。
- `max_tokens`: 2048 前後。`temperature`: 0.8 前後（創造性重視、数値は実装時調整）。

## 7. 静的ページ（SEO / AIO）

- `/numbers/1` 〜 `/numbers/9`: 各ライフパスナンバーの意味・特徴・強み・注意点・相性を解説する prerender ページ（tarot の `/cards/[name]` に相当）。コンテンツは実装時に手書きテンプレート（`src/lib/numberData.ts`）で用意し、LLM は使わない。
- `/about`: サービス紹介・数秘術の解説・免責。
- `/faq`: よくある質問（計算方法・精度・データ取り扱い等）＋ FAQPage JSON-LD。
- 全ページ: title / description / canonical / OGP / Twitter Card / JSON-LD（WebSite / WebApplication）を `Layout.astro` で一元管理。`@astrojs/sitemap` でサイトマップ自動生成。
- `PUBLIC_SITE_URL=https://nume.scryer.workers.dev` を canonical / OGP / sitemap の基底 URL に使用。

## 8. 環境変数・シークレット

| 名前 | 種別 | 用途 |
|---|---|---|
| `GROQ_API_KEY` | secret（本番: `wrangler secret put` / ローカル: `.env` & `.dev.vars`） | Groq API キー |
| `LLM_MODEL` | vars/secret | モデル名（デフォルト `llama-3.3-70b-versatile`） |
| `PUBLIC_SITE_URL` | public vars | `https://nume.scryer.workers.dev` |

## 9. wrangler.toml / 開発・デプロイ

```toml
name = "nume"
compatibility_date = "2026-06-18"
workers_dev = true
preview_urls = true

[vars]
PUBLIC_SITE_URL = "https://nume.scryer.workers.dev"

[observability]
enabled = true
```

```bash
npm install
npm run check   # 必須
npm run dev     # ローカル（.dev.vars 使用）
npm run build
npx wrangler secret put GROQ_API_KEY   # 本番シークレット
npm run deploy
```

## 10. tarot からの主な差分まとめ

| 項目 | tarot | nume |
|---|---|---|
| LLM | OpenRouter（`openrouter/free`、JSON schema 検証） | **Groq**（`llama-3.3-70b-versatile`、テキスト SSE ストリーム） |
| 占い入力 | スプレッド＋カード＋任意の悩み | **生年月日のみ** |
| コンテンツ | 78 枚のカードページ | **9 個のナンバーページ** |
| 計算ロジック | 外部 Tarot API | **自前の数秘術純関数** |
| 共通 | Astro 6 + React Islands + Tailwind 4、IP レートリミット 12/5分、OGP/アイコン生成、SEO/AIO、sitemap、免責 | そのまま流用 |

## 11. 今回の作業範囲

- 本ファイル（spec.md）の作成のみ。実装・ビルド・デプロイは別途。
