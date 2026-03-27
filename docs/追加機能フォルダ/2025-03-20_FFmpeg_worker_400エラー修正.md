# FFmpeg worker 400 エラー修正

日付: 2025-03-20

## 問題

動画アップロード後、「FFmpeg を読み込み中…」で固まる。Network タブで以下の 400 エラーが発生:

- URL: `http://localhost:5173/node_modules/@ffmpeg/ffmpeg/dist/esm/worker.js?worker_file&type=module`
- ステータス: 400 Bad Request

## 原因

`ffmpeg.load()` を引数なしで呼ぶと、デフォルトで相対パスから `worker.js` を読み込もうとする。Vite の dev サーバーではこのパス解決が不正になり、400 エラーが発生する。

## 修正内容

`frontend/src/lib/frameExtractor.ts` で以下を実施:

1. CDN の `@ffmpeg/core` を `toBlobURL` で明示的に指定
2. **classWorkerURL** を Vite の `?url` インポートで指定
   - `import workerUrl from "@ffmpeg/ffmpeg/worker?url"`
   - Vite が正しくバンドル・解決した worker URL を使用することで、`worker.js?worker_file&type=module` の 400 を回避
