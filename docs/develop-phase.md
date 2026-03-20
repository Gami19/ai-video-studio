# 開発フェーズ

> Cloudflareに向けた開発メモ.md を基にした、段階別開発ガイド

**アーキテクチャ**: backend（Workers）+ frontend（Pages）の分離構成

**リポジトリ**: frontend と backend は同じリポジトリ内の `frontend/` と `backend/` に配置（モノレポ）

---

## フェーズ一覧

| フェーズ | 内容 | コスト | 優先度 |
|----------|------|--------|--------|
| **Phase 0** | プロジェクト基盤構築 | 0円 | 最優先 |
| **Phase 1** | サムネイル生成 | 0円固定 + 変動約6円/回 | 必須 |
| **Phase 2** | 動画編集（AIなし） | 0円 | 推奨 |
| **Phase 3** | AI動画生成 | 約750円/月 + 変動 | 任意・将来 |

---

## モノレポの変わる点・注意点

### 1. Cloudflare のプロジェクト設定

| 項目 | モノレポ | 別リポジトリ |
|------|----------|--------------|
| Git 接続 | 同じリポジトリを 2 つのプロジェクトに接続 | リポジトリを分けて 1:1 で接続 |
| root ディレクトリ | それぞれ `frontend/`、`backend/` を指定 | 通常はルート（`/`） |
| build watch paths | `frontend/**` や `backend/**` で変更を限定 | 設定不要のことが多い |

→ **モノレポの場合は「プロジェクトごとに root と build watch paths を必ず設定する」ことが重要**

### 2. ビルドのトリガー

- 1 つのコミットで frontend と backend の**両方**のビルドが走る可能性がある
- `build watch paths` を設定すれば、`frontend/` 変更時は frontend のみ、`backend/` 変更時は backend のみ、といったように制御できる

### 3. CI/CD

- 1 リポジトリなので、同じ PR で frontend・backend の変更をまとめてレビューできる
- 必要なら、変更があったディレクトリに応じてビルド対象を切り替える処理を CI に組み込める

---

## Phase 0: プロジェクト基盤構築

### 目的

モノレポ構成で frontend / backend をセットアップし、Cloudflare にデプロイできる状態にする。

### タスク

#### 0.1 リポジトリ・ディレクトリ作成

- [ ] ブランチを切る
- [ ] `frontend/` ディレクトリ作成
- [ ] `backend/` ディレクトリ作成
- [ ] ルートに `package.json`（モノレポ用、任意）

#### 0.2 frontend セットアップ

- [ ] Vite + React + TypeScript で初期化
  ```bash
  cd frontend && npm create vite@latest . -- --template react-ts
  ```
- [ ] 依存関係インストール
- [ ] `VITE_API_URL` 用の `.env.example` 作成
- [ ] ビルド確認（`npm run build` → `dist/` に出力）

#### 0.3 backend セットアップ

- [ ] Hono + TypeScript で初期化
  ```bash
  cd backend && npm init -y
  npm install hono
  npm install -D wrangler typescript @cloudflare/workers-types
  ```
- [ ] `wrangler.jsonc` 作成
- [ ] `src/index.ts` に Hono の最小構成を記述
- [ ] `wrangler dev` でローカル起動確認

#### 0.4 Cloudflare プロジェクト接続（モノレポ版）

**1 つのリポジトリ**を **2 つの Cloudflare プロジェクト**に接続する。root と build watch paths の指定が必須。

- [ ] **frontend (Pages)**: Workers & Pages → Create → Pages → Connect to Git
  - リポジトリ: このプロジェクト（backend と同じリポジトリ）
  - Root directory: `frontend/`
  - Build command: `npm run build`
  - Build output directory: `dist`（root 基準）
  - Build watch paths: `frontend/**`（frontend 配下の変更時のみビルド）

- [ ] **backend (Workers)**: Workers & Pages → Create → Workers → Connect to Git
  - リポジトリ: このプロジェクト（frontend と同じリポジトリ）
  - Root directory: `backend/`
  - Build command: `npm run deploy` または `npx wrangler deploy`
  - Build watch paths: `backend/**`（backend 配下の変更時のみビルド）

#### 0.5 環境変数

- [ ] backend: `wrangler secret put GEMINI_API_KEY`
- [ ] backend: `wrangler secret put OPENAI_API_KEY`（Phase 1 で使用）
- [ ] frontend (Pages): Settings → Environment variables に `VITE_API_URL` を本番用に設定

### 完了条件

- frontend が Pages にデプロイされ、表示される
- backend が Workers にデプロイされ、`/` 等で応答する
- ローカルで frontend + backend を両方起動し、接続できる

---

## Phase 1: サムネイル生成

### 目的

動画をアップロード → フレーム抽出 → Gemini で分析 → DALL-E でサムネイル生成 → 表示・ダウンロード の E2E フローを実装する。

### フロー

```
動画アップロード → ffmpeg.wasm でフレーム抽出(3〜5枚)
    → POST /api/analyze (Gemini) → POST /api/generate (DALL-E)
    → サムネイル表示・ダウンロード
```

### タスク

#### 1.1 frontend: 動画アップロード・フレーム抽出

- [ ] `@ffmpeg/ffmpeg` と `@ffmpeg/util` をインストール
- [ ] `FrameExtractor.tsx` 作成（フレーム抽出ロジック）
- [ ] `VideoUploader.tsx` 作成（ファイル選択・進捗表示）
- [ ] 動画の長さを取得し、均等に 3〜5 枚抽出する処理を実装

#### 1.2 backend: /api/analyze

- [ ] `GoogleGenerativeAI` をインストール
- [ ] `POST /api/analyze` を実装
  - リクエスト: `{ frames: string[], userHint?: string }`（frames は base64）
  - レスポンス: `{ analysis: string, prompt: string }`
- [ ] Gemini 1.5 Flash でプロンプト生成
- [ ] `wrangler dev` で動作確認

#### 1.3 backend: /api/generate

- [ ] `openai` をインストール
- [ ] `POST /api/generate` を実装
  - リクエスト: `{ prompt: string }`
  - レスポンス: `{ imageUrl: string }`
- [ ] DALL-E 3 で画像生成（size: 1792x1024, quality: standard）

#### 1.4 frontend: API 連携・UI

- [ ] `lib/api.ts` 作成（`analyzeFrames`, `generateThumbnail`）
- [ ] `ThumbnailResult.tsx` 作成（生成画像の表示・ダウンロード）
- [ ] フロー全体の UI（アップロード → 分析 → 生成 → 結果）を実装
- [ ] エラーハンドリング・ローディング表示

**UI設計の指針（AIっぽさを減らす）**

このプロダクトの主役は「生成されたサムネイル画像」。テンプレ感を避け、実運用を想定したUIにする。

| 避けたい点 | 意識すること |
|------------|--------------|
| 全部が均一に整いすぎ | 主役（サムネイル）を1つに絞り、意図的なメリハリを入れる |
| よくあるパターンの寄せ集め | 動画→フレーム→分析→生成という体験の流れに沿った情報設計 |
| 色の意味が曖昧 | 操作色・状態色・注意色を役割ごとに整理し、同じ色に複数の意味を持たせない |
| 綺麗なモック止まり | 長文、欠損、エラー、ローディング中など実データ・例外を想定する |
| 情報・装飾が盛りすぎ | 最後に「本当に必要か」を確認し、削る前提で仕上げる |

**レビューチェックリスト**

- [ ] 主役となる情報（サムネイル）が明確か
- [ ] 「最初に見る → 次に比較する → 最後に行動する」の視線の流れがあるか
- [ ] 色に役割とルールがあるか（操作・状態・エラー等）
- [ ] エラー時・ローディング時・0件時でも破綻しないか
- [ ] なくてもよい装飾を削れているか

#### 1.5 CORS・環境変数

- [ ] backend に CORS ミドルウェア追加（frontend オリジン許可）
- [ ] frontend の `VITE_API_URL` を本番用に設定（Pages の Environment variables）

### 完了条件

- 動画をアップロードしてサムネイルが生成できる
- 本番環境（Pages + Workers）で E2E が動作する
- 1回あたりコストは約 6 円（Gemini + DALL-E）

---

## Phase 2: 動画編集（AIなし）

### 目的

ffmpeg.wasm だけで動画編集機能を追加。サーバーコストは 0 円。

### 機能

1. **動画と動画をつなげる**（クロスフェード等）
2. **画像からスライドショー動画を作る**

### タスク

#### 2.1 動画つなぎ合わせ

- [ ] 複数動画のアップロード UI
- [ ] ffmpeg.wasm で `xfade` を使ってクロスフェード実装
- [ ] 出力動画のダウンロード

#### 2.2 スライドショー動画

- [ ] 複数画像のアップロード UI
- [ ] ffmpeg.wasm で画像をスライドショー形式に結合
- [ ] 出力動画のダウンロード

### 完了条件

- 動画と動画をクロスフェードでつなげられる
- 画像からスライドショー動画を生成できる
- サーバーコスト 0 円で動作する

---

## Phase 3: AI動画生成（将来）

### 前提

- Workers Paid（$5/月）が必要
- Queues + R2 の導入が必要
- コスト・需要を見極めてから検討

### 想定フロー

```
フロント → POST /api/jobs (ジョブ投入) → Queues
    → Consumer Worker が Runway/Stability 等を呼び出し
    → 結果を R2 に保存
    → フロントはポーリング or WebSocket で完了を待つ
```

### タスク（概要）

- [ ] Workers Paid にアップグレード
- [ ] Queues の作成・Producer/Consumer Worker の実装
- [ ] R2 バケット作成・動画保存ロジック
- [ ] フロントにジョブ投入・ステータス確認 UI

### 参考

- Cloudflare Queues: https://developers.cloudflare.com/queues/
- R2: https://developers.cloudflare.com/r2/
- addition-function.md のコスト・制約を確認

---

## 共通リファレンス

| 項目 | 参照 |
|------|------|
| ディレクトリ構成 | Cloudflareに向けた開発メモ.md §5 |
| コード例 | Cloudflareに向けた開発メモ.md §6 |
| コスト試算 | Cloudflareに向けた開発メモ.md §8 / cost.md |
| ローカル開発 | Cloudflareに向けた開発メモ.md §10 |
