# Imagen 有料プラン制限と `/api/generate` エラーハンドリング（2025-03-25）

## 現象

`POST /api/generate` 実行時、Google API が次のような 400 を返すことがある。

- メッセージ例: `Imagen 3 is only available on paid plans. Please upgrade your account at https://ai.dev/projects.`

無料枠のみの API キーでは Imagen 画像生成が使えない（プラン・課金の制約）。

## 以前の問題

`catch` で `throw err` していたため、Hono が **未処理例外として 500** を返していた。フロントからは「サーバーエラー」に見えるだけで、**課金が必要**という原因が伝わらない。

## 対応（`backend/src/routes/generate.ts`）

- エラーメッセージに `paid plans` / `upgrade your account` / `only available on paid` が含まれる場合:
  - **HTTP 402**
  - JSON: `{ "error": "…（日本語で有料プラン案内）…", "code": "IMAGEN_PAID_PLAN_REQUIRED" }`
- それ以外の生成失敗:
  - **HTTP 502**
  - JSON: `{ "error": "…", "code": "IMAGE_GENERATION_FAILED" }`
- 詳細は引き続き `console.error` に出力

## 開発者向けメモ

- **402** は「支払い・プランが必要」という意味でクライアントに伝えやすい。必須ではないが、フロントで `code === "IMAGEN_PAID_PLAN_REQUIRED"` のときだけ専用文言を出すこともできる。
- 根本解決は **有効な課金プランで Imagen が使えるプロジェクトの API キー**を `GEMINI_API_KEY` に設定すること。
