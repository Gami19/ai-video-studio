# Phase 1: サムネイル生成 — Backend 実装計画

> 参照: [develop-phase.md](../develop-phase.md) Phase 1 / [Cloudflareに向けた開発メモ.md](../Cloudflareに向けた開発メモ.md) §6

## 目的

動画フレームを Gemini 2.5 Flash で分析し、Imagen 4 でサムネイル画像を生成する API を実装する。

## フロー上の位置

```
[1] 動画アップロード (frontend)
[2] ffmpeg.wasm でフレーム抽出 (frontend)
[3] POST /api/analyze ← 本実装
[4] POST /api/generate ← 本実装
[5] サムネイル表示・ダウンロード (frontend)
```

---

## タスク一覧

### 1. 依存関係

- [ ] `@google/genai` をインストール
  ```bash
  cd backend && npm install @google/genai
  ```

### 2. POST /api/analyze（フレーム分析）

| 項目 | 内容 |
|------|------|
| 役割 | キーフレーム画像を Gemini 2.5 Flash に送り、分析とサムネイル用プロンプトを生成 |
| リクエスト | `{ frames: string[], userHint?: string }`（frames は base64 文字列配列） |
| レスポンス | `{ analysis: string, prompt: string }` |
| モデル | `gemini-2.5-flash` |

**実装ポイント**

- `frames` は base64 のまま Gemini API に渡す（`inlineData.data`）
- プロンプトで JSON 形式を指定し、`JSON.parse` でパース
- エラー時は適切な HTTP ステータスとエラーメッセージを返す

**コード例（参考）**: Cloudflareに向けた開発メモ.md §6「Gemini でフレーム分析」

### 3. POST /api/generate（画像生成）

| 項目 | 内容 |
|------|------|
| 役割 | 分析結果のプロンプトで Imagen 4 にサムネイル画像を生成 |
| リクエスト | `{ prompt: string }` |
| レスポンス | `{ imageBase64: string }` |
| モデル | `imagen-4.0-generate-001` |
| 設定 | `aspectRatio: '16:9'`, `numberOfImages: 1` |

**実装ポイント**

- プロンプトは YouTube サムネイル向けに補強（例: "YouTube thumbnail style, eye-catching, high contrast, bold composition..."）
- `generatedImages[0].image.imageBytes` が base64
- R2 にアップロードして `imageUrl` を返す案もあるが、Phase 1 では base64 で十分

**コード例（参考）**: Cloudflareに向けた開発メモ.md §6「画像生成」

### 4. CORS

- [ ] Hono に CORS ミドルウェアを追加
- [ ] frontend オリジン（本番・ローカル）を許可
- [ ] `OPTIONS` プリフライトリクエストに対応

### 5. 環境変数

- [ ] `GEMINI_API_KEY` を `wrangler secret put` で設定
- [ ] `wrangler.jsonc` の `[vars]` または bindings で型定義

### 6. 動作確認

- [ ] `wrangler dev` でローカル起動
- [ ] `/api/analyze` にテスト用 base64 画像を送ってレスポンス確認
- [ ] `/api/generate` にテスト用プロンプトを送って画像取得確認
- [ ] frontend と接続して E2E 確認

### 7. セキュリティ対策（Phase 1 必須）

Phase 1 で実装すべきサーバーサイドのセキュリティ対策。実装の優先順位が高い項目。

- [ ] **入力バリデーション（Zod 等）**
  - `frames`・`userHint`・`prompt` をスキーマで検証
  - 型・長さ・枚数などの制約を強制（例: frames 1〜5枚、prompt 最大2000文字）
  - `zod` や Hono の `zValidator` を利用

- [ ] **ペイロードサイズ制限**
  - base64 画像の合計サイズを制限（例: 1枚5MB×5枚≒25MB 以内）
  - リクエストボディが過大な場合は 400 で早期リジェクト

- [ ] **エラーハンドラ（詳細を非表示）**
  - `app.onError` でキャッチし、本番ではスタックトレースを返さない
  - クライアントには汎用メッセージ（例: `"An error occurred"`）のみ返す
  - 詳細は `console.error` で Workers ログに記録

- [ ] **CORS 設定**
  - 許可オリジンを明示（`*.pages.dev`、カスタムドメイン、`localhost:5173`）
  - ワイルドカード `*` は使用しない

- [ ] **GEMINI_API_KEY のシークレット管理**
  - `wrangler secret put GEMINI_API_KEY` で設定（コードや `[vars]` に書かない）
  - `Env` 型で bindings を型定義

---

## ファイル構成（backend）

```
backend/
├── src/
│   └── index.ts   # Hono app, /api/analyze, /api/generate, CORS
├── wrangler.jsonc
└── package.json
```

---

## 参照

- [develop-phase.md](../develop-phase.md) Phase 1.2, 1.3, 1.5
- [Cloudflareに向けた開発メモ.md](../Cloudflareに向けた開発メモ.md) §4, §6
