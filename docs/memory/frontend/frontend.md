# Phase 1: サムネイル生成 — Frontend 実装計画

> 参照: [develop-phase.md](../develop-phase.md) Phase 1 / [Cloudflareに向けた開発メモ.md](../Cloudflareに向けた開発メモ.md) §6

## 目的

動画をアップロードし、ffmpeg.wasm でフレーム抽出 → backend API 呼び出し → サムネイル表示・ダウンロードまでの E2E フローを実装する。

## フロー全体

```
[1] 動画アップロード ← 本実装
[2] ffmpeg.wasm でフレーム抽出 ← 本実装
[3] POST /api/analyze (backend)
[4] POST /api/generate (backend)
[5] サムネイル表示・ダウンロード ← 本実装
```

---

## タスク一覧

### 1. 依存関係

- [ ] `@ffmpeg/ffmpeg` をインストール
- [ ] `@ffmpeg/util` をインストール
  ```bash
  cd frontend && npm install @ffmpeg/ffmpeg @ffmpeg/util
  ```

### 2. 動画アップロード・フレーム抽出（1.1）

#### 2.1 FrameExtractor

- [ ] `FrameExtractor.tsx`（または `lib/frameExtractor.ts`）を作成
- [ ] 動画の長さを取得
- [ ] 均等に 3〜5 枚のフレームを抽出
- [ ] 出力は base64 文字列配列（backend API にそのまま渡すため）

**技術メモ**

- `FFmpeg.load()` は初回に WASM を読み込むため遅い可能性あり → ローディング表示を用意
- `fps` または `select` フィルタで均等抽出を実現

**コード例（参考）**: Cloudflareに向けた開発メモ.md §6「フレーム抽出」

#### 2.2 VideoUploader

- [ ] `VideoUploader.tsx` を作成
- [ ] ファイル選択（動画のみ許可）
- [ ] 進捗表示（アップロード・フレーム抽出中）
- [ ] 抽出したフレームのプレビュー表示（任意）

### 3. API 連携・UI（1.4）

#### 3.1 lib/api.ts

- [ ] `analyzeFrames(frames: string[], userHint?: string)` を実装
  - `POST /api/analyze` を呼び出し
  - レスポンス: `{ analysis, prompt }`
- [ ] `generateThumbnail(prompt: string)` を実装
  - `POST /api/generate` を呼び出し
  - レスポンス: `{ imageBase64 }`
- [ ] `VITE_API_URL` を base URL として使用

**コード例（参考）**: Cloudflareに向けた開発メモ.md §6「フロントからの API 呼び出し」

#### 3.2 ThumbnailResult

- [ ] `ThumbnailResult.tsx` を作成
- [ ] 生成画像の表示（base64 を `data:image/...` として表示）
- [ ] ダウンロードボタン（画像をファイルとして保存）
- [ ] エラー時の表示

#### 3.3 フロー全体 UI

- [ ] アップロード → フレーム抽出 → 分析 → 生成 → 結果 の順で UI を構成
- [ ] 各ステップのローディング表示
- [ ] エラーハンドリング（API エラー、ネットワークエラー等）

### 4. UI 設計の指針（AIっぽさを減らす）

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

### 5. 環境変数

- [ ] `.env.example` に `VITE_API_URL` の例を記載
- [ ] 本番: Cloudflare Pages の Environment variables に `VITE_API_URL` を設定（backend Workers URL）

### 6. 動作確認

- [ ] ローカルで `npm run dev` + backend の `wrangler dev` で E2E 確認
- [ ] 本番（Pages + Workers）でデプロイして E2E 確認

---

## ファイル構成（frontend）

```
frontend/
├── src/
│   ├── components/
│   │   ├── VideoUploader.tsx
│   │   ├── FrameExtractor.tsx  # または lib に配置
│   │   └── ThumbnailResult.tsx
│   ├── lib/
│   │   ├── api.ts
│   │   └── frameExtractor.ts   # フレーム抽出ロジック（任意）
│   ├── App.tsx
│   └── main.tsx
├── .env.example
└── package.json
```

---

## 参照

- [develop-phase.md](../develop-phase.md) Phase 1.1, 1.4, 1.5
- [Cloudflareに向けた開発メモ.md](../Cloudflareに向けた開発メモ.md) §4, §5, §6
