# analyze API: Gemini 応答のスキーマ固定とパース正規化（2025-03-25）

## 背景

`/api/analyze` が 502 になる事例で、Gemini が次のような応答を返していた。

- `analysis` が文字列ではなく、`genre_content` などのネストしたオブジェクト
- `prompt` が途中で切れ、JSON が不正
- 先頭に ` ```json ` などのフェンスが付く

既存の `parseGeminiJson` は `analysis` / `prompt` が両方とも文字列の場合のみ受理していた。

## 変更内容（`backend/src/routes/analyze.ts`）

1. **`generateContent` の `config`**
   - `responseMimeType: "application/json"`
   - `responseSchema`: トップレベルはオブジェクト、`analysis` / `prompt` は **STRING** のみ（`Type` 列挙で定義）
   - `maxOutputTokens: 4096` で長文による切り捨てを緩和

2. **システム側プロンプトの明文化**
   - `analysis` は日本語の **1 文字列**、オブジェクト分割禁止
   - マークダウンのコードブロック禁止

3. **`parseGeminiJson` の防御的処理**
   - `normalizeAnalysisField`: `analysis` がオブジェクトのときは `key: value` を連結して 1 本の文字列にする（レガシー応答向け）
   - `prompt` が空のときは英語の **フォールバック** Imagen 用プロンプトを使用（502 より実用優先）

## 学習メモ（ジュニア向け）

- **構造化出力（response schema）** を付けると、モデルが勝手にネストした JSON を返しにくくなる。パースだけ頑張すより、API 側で形を拘束する方が安定しやすい。
- それでも古いモデル応答やキャッシュが残る可能性があるので、**正規化レイヤ**を薄く持つと運用が楽になる。
