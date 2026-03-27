# Phase 1 Backend 実装完了

**日付**: 2025-03-20  
**対象**: Phase 1 サムネイル生成 — Backend

## 実装内容

### 1. 依存関係

- `@google/genai` — Gemini 2.5 Flash / Imagen 4 API
- `zod` — スキーマバリデーション
- `@hono/zod-validator` — Hono と Zod の統合  
  ※ CORS は Hono 内蔵 (`hono/cors`) を使用

### 2. ファイル構成

```
backend/
├── src/
│   ├── index.ts         # Hono app, CORS, エラーハンドラ, ペイロードサイズ制限
│   ├── types.ts         # Env 型定義
│   ├── schemas/
│   │   └── index.ts     # Zod スキーマ (analyze, generate)
│   └── routes/
│       ├── analyze.ts   # POST /api/analyze
│       └── generate.ts  # POST /api/generate
├── .dev.vars.example    # ローカル開発用環境変数の例
├── wrangler.jsonc       # ALLOWED_ORIGINS を vars に追加
└── package.json         # dev, deploy スクリプト追加
```

### 3. API エンドポイント

| エンドポイント | リクエスト | レスポンス | 役割 |
|----------------|------------|------------|------|
| POST /api/analyze | `{ frames: string[], userHint?: string }` | `{ analysis, prompt }` | キーフレームを Gemini 2.5 Flash で分析 |
| POST /api/generate | `{ prompt: string }` | `{ imageBase64: string }` | Imagen 4 でサムネイル画像を生成 |

### 4. セキュリティ対策

- **入力バリデーション (Zod)**: frames 1〜5枚、userHint 最大500文字、prompt 最大2000文字
- **ペイロードサイズ制限**: 合計25MB、各フレーム5MB、Content-Length で26MB超は早期リジェクト
- **base64 プレフィックス除去**: `data:image/jpeg;base64,` を正規化
- **エラーハンドラ**: 本番ではスタックトレース非表示、汎用メッセージのみ返却
- **CORS**: `ALLOWED_ORIGINS` 環境変数で許可オリジンを管理（デフォルト: localhost:5173）
- **GEMINI_API_KEY**: wrangler secret で設定（コード・vars に書かない）

### 5. 環境変数

| 変数 | 設定方法 | 用途 |
|------|----------|------|
| GEMINI_API_KEY | `wrangler secret put GEMINI_API_KEY` または `.dev.vars` | Gemini / Imagen API |
| ALLOWED_ORIGINS | wrangler.jsonc の vars または Cloudflare ダッシュボード | CORS 許可オリジン（カンマ区切り） |

### 6. ローカル開発

1. `.dev.vars.example` を `.dev.vars` にコピーし、`GEMINI_API_KEY` を設定
2. `cd backend && npm run dev`
3. `http://localhost:8787` で起動

### 7. 動作確認手順

1. `wrangler dev` でローカル起動
2. `/api/analyze` に base64 画像を POST
3. `/api/generate` にプロンプトを POST
4. 不正リクエストで 400 が返ることを確認

## 参考

- [docs/memory/backend/backend.md](../memory/backend/backend.md)
- [docs/Cloudflareに向けた開発メモ.md](../Cloudflareに向けた開発メモ.md) §6
