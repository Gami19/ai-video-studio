# Phase 2: Gemini 編集プラン API（/api/edit-plan）設計メモ

日付: 2026-03-31

## ねらい

- Phase 2（動画つなぎ合わせ / 画像素材から演出付き動画）で、**レンダリングはブラウザ**（WebCodecs+Canvas）に寄せつつ、
  **編集の“判断”は Gemini** に寄せる。
- Workers（backend）で Gemini を呼び、**編集プラン（JSON）** を返す。

## 非ゴール

- この API は「完成動画バイナリ」を返さない（動画変換はしない）
- 音声の扱い（BGM/ナレーション/字幕同期）は当面しない（無音MP4）

## API 仕様（案）

### `POST /api/edit-plan`

#### リクエスト（案）

- `userIntent?: string`（最大 500 文字）
- `clips?: Array<ClipInput>`（動画素材。動画つなぎ合わせ用）
- `images?: Array<ImageInput>`（画像素材。画像→演出付き動画用）

`ClipInput`（案）
- `id: string`
- `durationSec: number`
- `framesBase64: string[]`（3〜5枚程度。`data:image/jpeg;base64,` 付きも許容→正規化）
- `label?: string`（任意。ファイル名など）

`ImageInput`（案）
- `id: string`
- `imageBase64: string`（`data:image/jpeg;base64,` 付きも許容→正規化）
- `label?: string`

#### レスポンス（案）

`plan` を返す（JSON）

- `sequence`: 配列（素材をどの順に使うか）
- `clips?`: 動画編集プラン（トリム区間など）
- `transitions?`: 遷移（クロスフェード秒数など）
- `imageVideo?`: 画像→動画のプラン（秒数・演出）

例（概念）

```json
{
  "plan": {
    "sequence": [
      { "kind": "clip", "id": "c1" },
      { "kind": "clip", "id": "c2" }
    ],
    "clips": [
      { "id": "c1", "startSec": 0.5, "endSec": 6.0 },
      { "id": "c2", "startSec": 1.0, "endSec": 7.0 }
    ],
    "transitions": [
      { "type": "crossfade", "durationSec": 0.8 }
    ]
  }
}
```

画像→演出付き動画（概念）

```json
{
  "plan": {
    "sequence": [
      { "kind": "image", "id": "i1" },
      { "kind": "image", "id": "i2" }
    ],
    "imageVideo": {
      "secondsPerImage": 2.5,
      "effects": [
        { "type": "zoom", "strength": 0.06 },
        { "type": "fade", "durationSec": 0.3 }
      ]
    }
  }
}
```

## バリデーション/制限（Phase1の知見を流用）

- base64 は `data:*;base64,` のプレフィックスを除去して正規化（`normalizeFrames` 相当）
- 画像枚数・合計サイズの上限を設ける（Workers のリクエストボディ/コスト対策）
- 不正入力は 400（Zod + `flattenError` でメッセージ整形）

## Gemini への投げ方（方針）

- `responseMimeType: "application/json"` + `responseSchema` を使い、**返却 JSON の形を固定**する
- スキーマに沿わない応答は 502 で返し、ログに先頭数百文字を残す（`/api/analyze` と同じ運用）
- プロンプトでは「説明文やコードフェンスを付けない」ことを明示し、**JSONのみ**を要求

## エラーハンドリング（方針）

- 400: 入力バリデーション失敗
- 500: 環境変数不足（`GEMINI_API_KEY` 未設定）
- 502: Gemini 応答が空/JSON不正/スキーマ不一致

## なぜ“動画生成”をGeminiに任せないのか（判断の軸）

- Gemini は「編集判断（構成）」が得意。動画のエンコード/コンテナ化はブラウザ実装（WebCodecs）の方が制御しやすい
- 動画バイナリを Workers で扱うと、Queues/R2/実行時間/コスト設計が重くなりやすい（Phase3領域）

