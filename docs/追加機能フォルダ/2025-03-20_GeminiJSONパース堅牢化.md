# Gemini JSONパース堅牢化

日付: 2025-03-20

## 問題

`POST /api/analyze` で Gemini が以下のように Markdown コードフェンス付きで返す場合があり、
`JSON.parse(text)` が失敗して 500 になっていた。

- 例: ```json ... ```

## 対応

`backend/src/routes/analyze.ts` に `parseGeminiJson()` を追加し、以下を順に試すようにした。

1. 先頭末尾の ```json / ``` を除去した文字列
2. 最初の `{` 〜 最後の `}` の部分文字列

どちらかで `{ analysis: string, prompt: string }` が取得できれば成功とする。

## 効果

- コードフェンス付き応答でも `/api/analyze` が 502/500 になりにくくなる
- 解析不能時は 502 で `Invalid JSON response from Gemini` を返し、ログに先頭 500 文字を残す
