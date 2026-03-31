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
| **Phase 2** | 動画編集（Geminiで編集プラン生成） | 0円 + 変動（Gemini） | 推奨 |
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

- [ ] backend: `wrangler secret put GEMINI_API_KEY`（分析・画像生成ともに使用）
- [ ] frontend (Pages): Settings → Environment variables に `VITE_API_URL` を本番用に設定

### 完了条件

- frontend が Pages にデプロイされ、表示される
- backend が Workers にデプロイされ、`/` 等で応答する
- ローカルで frontend + backend を両方起動し、接続できる

---

## Phase 1: サムネイル生成

### 目的

動画をアップロード → フレーム抽出 → Gemini 2.5 Flash で分析 → Imagen 4 でサムネイル生成 → 表示・ダウンロード の E2E フローを実装する。

### フロー

```
動画アップロード → ブラウザ（HTMLVideoElement + Canvas）でフレーム抽出（3〜5枚・base64）
    → POST /api/analyze (Gemini 2.5 Flash) → POST /api/generate (Imagen 4)
    → サムネイル表示・ダウンロード
```

※ Phase 1 では **ffmpeg.wasm は使わない**（バンドルと初期ロードを抑え、主要ブラウザのネイティブデコーダで十分なため）。Phase 2 も ffmpeg.wasm ではなく、まずは **WebCodecs + Canvas** で成立させる方針で検討する。

### タスク

#### 1.1 frontend: 動画アップロード・フレーム抽出

- [ ] `lib/frameExtractor.ts` で抽出（`HTMLVideoElement` にシーク → `Canvas` で描画 → JPEG base64）
- [ ] `VideoUploader.tsx`（ファイル選択・進捗・抽出の起動）
- [ ] 動画の長さ（`duration`）を取得し、均等に 3〜5 枚抽出する処理（長辺上限・画質はペイロードと描画負荷を踏まえて調整）

#### 1.2 backend: /api/analyze

- [ ] `@google/genai` をインストール
- [ ] `POST /api/analyze` を実装
  - リクエスト: `{ frames: string[], userHint?: string }`（frames は base64）
  - レスポンス: `{ analysis: string, prompt: string }`
- [ ] Gemini 2.5 Flash でプロンプト生成
- [ ] `wrangler dev` で動作確認

#### 1.3 backend: /api/generate

- [ ] `@google/genai`（analyze と共通）で Imagen 4 を利用
- [ ] `POST /api/generate` を実装
  - リクエスト: `{ prompt: string }`
  - レスポンス: `{ imageBase64: string }`（または R2 にアップロードして `imageUrl`）
- [ ] Imagen 4 で画像生成（aspectRatio: 16:9）

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
- 1回あたりコストは約 6 円（Gemini + Imagen）

---

## Phase 2: 動画編集（Geminiで編集プラン生成）

### 目的

ffmpeg.wasm を使わず、**Gemini（Workers）で編集プランを生成**し、**ブラウザ標準 API（WebCodecs + Canvas）** でレンダリングして動画を作成する。サーバーコストは（レンダリングに関して）0 円。

### 機能

1. **動画と動画をつなげる**（クロスフェード等）
2. **画像素材から演出付きの動画を作る**（スライドショー/ズーム/パン/フェード等）

### 方針（重要）

- **ターゲット**: デスクトップ Chrome/Edge + Safari
- **出力**: **MP4（当面は無音でOK）**
- **Geminiの役割**: 素材（フレーム/画像）+ メタデータから **編集プラン（JSON）** を生成（順序、採用区間、秒数、演出、遷移）
- **実装アプローチ**:
  - 動画連結/クロスフェード: `VideoDecoder` でデコード → `Canvas` 上でブレンド（クロスフェード）→ `VideoEncoder` でエンコード
  - 画像→動画: `Canvas` に画像を描画（ズーム/パン等の演出）してフレーム生成 → `VideoEncoder` でエンコード
  - MP4 コンテナ化（mux）: 軽量な JS muxer を利用（例: mp4 muxer）

### フロー（概要）

```
素材アップロード（動画/画像）
  → フレーム抽出/メタデータ整形（frontend）
  → POST /api/edit-plan（Workers: Gemini）
  → 編集プラン（JSON）を受け取る
  → プランをプレビュー/微調整（frontend）
  → WebCodecs + Canvas でレンダリング
  → MP4（当面無音）をダウンロード
```

### リスク・フォールバック（必ず用意）

- **WebCodecs 対応差**: Safari/Chrome でエンコーダ設定や挙動が異なる可能性があるため、機能検出 + 小さな検証（数秒動画）を最初に行う
- **フォールバック案**（MP4必須を満たすため）:
  - Phase 2.5 として「サーバー側変換」を別工程で追加（外部変換サービス等を許容）
  - もしくは「非対応ブラウザは編集機能を無効化し、対応ブラウザへ誘導」などのプロダクト判断を明記

### タスク

#### 2.0 backend: /api/edit-plan（編集プラン生成）

- [ ] `POST /api/edit-plan` を実装（Gemini 2.5 Flash）
  - リクエスト（例）:
    - `clips: Array<{ id: string; durationSec: number; framesBase64: string[]; label?: string }>`
    - `images: Array<{ id: string; imageBase64: string; label?: string }>`
    - `userIntent?: string`（例:「短くテンポ良く」「落ち着いた雰囲気」）
  - レスポンス（例）:
    - `plan`（順序、採用区間、クロスフェード秒数、画像→動画の秒数/演出）
- [ ] JSONスキーマ（responseSchema）で返却形式を固定し、パースを堅牢化

#### 2.1 動画つなぎ合わせ

- [ ] 複数動画のアップロード UI
- [ ] フレーム抽出（Phase 1 と同様に HTMLVideoElement + Canvas で数枚）+ クリップメタデータ収集
- [ ] `/api/edit-plan` に送信し、編集プラン（順序/トリム/遷移）を取得してプレビュー表示
- [ ] WebCodecs でデコード → Canvas でクロスフェード合成 → H.264 で再エンコード
- [ ] MP4（無音）として mux してダウンロード
- [ ] 機能検出（`VideoEncoder`/`VideoDecoder`）と、非対応時の案内 UI

#### 2.2 画像素材から演出付き動画

- [ ] 複数画像のアップロード UI
- [ ] `/api/edit-plan` に送信し、編集プラン（順序/秒数/演出）を取得してプレビュー表示
- [ ] Canvas でフレーム生成 → WebCodecs でエンコード
- [ ] MP4（無音）として mux してダウンロード
- [ ] 機能検出（`VideoEncoder`）と、非対応時の案内 UI

### 完了条件

- 動画と動画をクロスフェードでつなげられる
- 画像素材から演出付きの動画を生成できる
- Gemini から返った編集プラン（JSON）を UI で確認できる
- **MP4（無音）をダウンロード**できる
- サーバーコスト 0 円で動作する

---

## Phase 3: AI動画生成（将来）

### 前提

- Workers Paid（$5/月）が必要
- Queues + R2 の導入が必要
- コスト・需要を見極めてから検討
- Phase 3 自体は **ffmpeg.wasm 前提ではない**（生成・保存・配信の非同期基盤が中心）

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
- [ ] （必要なら）後処理（尺調整・フォーマット変換・サムネ生成）は **別工程として分離**して検討（Phase 3 の必須要件に混ぜない）

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
