# Phase 2/3: ffmpeg.wasm を使わない方針で再検討

日付: 2026-03-31

## 背景

- Phase 1 は `HTMLVideoElement + Canvas` によるフレーム抽出へ移行済み（ffmpeg.wasm 依存を削減）。
- ただしドキュメント上は Phase 2（編集）が ffmpeg.wasm 前提のまま残っていたため、Phase 2/3 の方針を再整理した。

## 決定（現時点の方針）

### Phase 2（動画編集・AIなし）

- **ffmpeg.wasm は使わない**
- **ターゲット**: デスクトップ Chrome/Edge + Safari
- **出力**: **MP4 必須**、ただし **当面は無音でOK**
- **実装方針**: WebCodecs + Canvas
  - デコード: `VideoDecoder`
  - 合成: `Canvas`（クロスフェードは alpha ブレンド）
  - エンコード: `VideoEncoder`（H.264）
  - コンテナ化: MP4 mux（軽量 JS muxer を想定）

### Phase 3（AI動画生成・将来）

- ffmpeg.wasm 依存は本質ではなく、**Queues + R2 + 外部AI API** による非同期基盤が中心。
- 後処理（尺調整・フォーマット変換・サムネ生成等）が必要になった場合は、Phase 3 の必須要件から分離し、別工程として検討する。

## リスクとフォールバック

- **WebCodecs の実装差**（特に Safari）により、エンコード設定や挙動が変わる可能性がある。
- フォールバック案:
  - Phase 2.5 として **サーバー側変換**（外部変換サービス等）を追加し、MP4 必須を確実に満たす
  - 非対応ブラウザでは編集機能を無効化し、対応ブラウザへ誘導する（プロダクト判断）

## 変更したドキュメント

- `docs/develop-phase.md`
  - Phase 2 を WebCodecs + Canvas + MP4（当面無音）方針へ更新
  - Phase 3 の前提を「ffmpeg.wasm ではなく非同期基盤中心」に整理
  - リスク/フォールバックを追記
- `docs/Cloudflareに向けた開発メモ.md`
  - Phase 1/2 の ffmpeg 前提記述を Web標準API 方針へ整合

