# Cloudflare に向けた開発メモ

> dev.md / cost.md / addition-function.md を統合。Cloudflare を採用する方針の開発メモ

**採用アーキテクチャ: backend（Workers）+ frontend（Pages）の分離構成**

---

## 1. コスト最小化の核心戦略

```
動画全体をAIに渡さない → フレーム抽出(クライアント側) → 数枚だけAIへ送る
```

ffmpeg.wasm でブラウザ内処理することでサーバー費用ゼロ、AI API には数枚の画像だけ送ることで API コストを最小化。

---

## 2. なぜ Cloudflare を選ぶか

### Vercel との制約比較

| 制約 | Vercel 無料枠 | Cloudflare Workers Free |
|------|---------------|-------------------------|
| **タイムアウト** | 10秒（リクエスト全体） | CPU時間 10ms（※ネットワーク待ちはカウント外） |
| **リクエストボディ** | 4.5MB | **100MB** |
| **リクエスト数** | 制限あり | 10万/日 |

**結論**: リクエストボディ・タイムアウトのいずれも Cloudflare が有利。  
addition-function.md で問題になった「動画ファイル数十MB」「AI処理30秒〜数分」も、Cloudflare では Workers Paid + Queues で対応可能（Vercel は Railway 等の外部サービスが必須だった）。

---

## 3. 推奨技術スタック（backend / frontend 分離）

```
┌─────────────────────────────────────────────────────────────┐
│  frontend/  →  Cloudflare Pages (別プロジェクト)              │
│  Vite + React + TypeScript                                  │
│  静的ビルド → CDN配信                                        │
├─────────────────────────────────────────────────────────────┤
│  backend/   →  Cloudflare Workers (別プロジェクト)            │
│  Hono + TypeScript                                          │
│  /api/analyze  /api/generate                                │
├─────────────────────────────────────────────────────────────┤
│  ffmpeg.wasm (ブラウザ内・サーバーコスト0)                    │
├─────────────────────────────────────────────────────────────┤
│  Gemini 1.5 Flash   │  DALL-E 3 / Replicate                 │
│  (映像理解・激安)    │  (サムネイル生成)                      │
└─────────────────────────────────────────────────────────────┘
```

### 分離構成を選ぶ理由（管理面）

| 観点 | 分離のメリット |
|------|----------------|
| **デプロイ** | UI と API を別タイミングでリリース可能 |
| **権限・チーム** | フロント担当と API 担当で責任範囲を分けやすい |
| **コスト** | フェーズ3では backend だけ Workers Paid にできる |
| **監視** | API のリクエスト数・エラーを独立して確認できる |

### 技術選定理由

| 選択肢 | 理由 |
|--------|------|
| **Vite + React (Pages)** | 軽量・高速。静的ビルドで Pages に最適 |
| **Hono (Workers)** | Workers 向け最適化。API 専用に適している |
| **ffmpeg.wasm** | フレーム抽出をブラウザで完結。サーバー処理なし |
| **Gemini 1.5 Flash** | 画像理解AIの中で最安級 |
| **DALL-E 3** | $0.04/枚。Replicate も選択肢 |
| **認証** | 1人ユーザーなら環境変数でシンプル保護 |

### フェーズ3（AI動画生成）を追加する場合

```
┌─────────────────────────────────────────────┐
│  Workers Paid ($5/月)                        │
│  CPU時間 最大5分、Queues利用可               │
├─────────────────────────────────────────────┤
│  Cloudflare Queues                           │
│  非同期ジョブ投入・Consumer Worker で処理    │
├─────────────────────────────────────────────┤
│  R2 (動画保存)                               │
│  10GB/月無料、エグレス無料                   │
└─────────────────────────────────────────────┘
```

→ Vercel 構成では Railway（約750円/月）+ ストレージが必要だったが、Cloudflare は Workers Paid + R2 で完結可能。

---

## 4. フロー設計

### フェーズ1: サムネイル生成

```
[1] 動画アップロード (ブラウザ内)
        ↓
[2] ffmpeg.wasm でフレーム抽出
    └── 均等に 3〜5枚だけ抽出 (コスト削減の肝)
        ↓
[3] POST /api/analyze (Workers)
    └── Gemini 1.5 Flash に画像送信
    └── 「この動画の内容・雰囲気・ジャンルを分析して
          サムネイル生成プロンプトを作って」
        ↓
[4] POST /api/generate (Workers)
    └── 生成されたプロンプト → DALL-E 3
        ↓
[5] サムネイル画像を表示・ダウンロード
```

### フェーズ2: 動画編集（AIなし）

- 動画と動画をつなげる（クロスフェード等）→ ffmpeg.wasm でブラウザ内完結
- 画像からスライドショー動画 → ffmpeg.wasm でブラウザ内完結
- **サーバーコスト: 0円**

### フェーズ3: AI動画生成（将来）

- Queues にジョブ投入 → Consumer Worker が Runway/Stability 等を呼び出し → R2 に保存
- フロントはポーリング or WebSocket で完了を待つ

---

## 5. ディレクトリ構成（backend / frontend 分離）

### モノレポ構成（推奨）

同じリポジトリ内で frontend / backend を分離。Cloudflare はモノレポ対応のため、各プロジェクトに root ディレクトリを指定して別々にデプロイ可能。

```
ai-video-studio/
├── frontend/                     # Cloudflare Pages プロジェクト
│   ├── src/
│   │   ├── components/
│   │   │   ├── VideoUploader.tsx
│   │   │   ├── FrameExtractor.tsx   # ffmpeg.wasm使用
│   │   │   └── ThumbnailResult.tsx
│   │   ├── lib/
│   │   │   ├── api.ts              # backend API 呼び出し
│   │   │   └── ...
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json
│   └── (Pages: root=frontend/, build=dist/)
│
├── backend/                      # Cloudflare Workers プロジェクト
│   ├── src/
│   │   └── index.ts              # Hono: /api/analyze, /api/generate
│   ├── wrangler.jsonc
│   ├── package.json
│   └── (Workers: root=backend/)
│
└── package.json                  # モノレポ用 (任意)
```

### デプロイ設定

| プロジェクト | 種別 | root ディレクトリ | ビルドコマンド | 出力 |
|--------------|------|-------------------|----------------|------|
| **frontend** | Pages | `frontend/` | `npm run build` | `frontend/dist` |
| **backend**  | Workers | `backend/`  | `npm run deploy` or `wrangler deploy` | - |

### build watch paths（モノレポ用）

- frontend プロジェクト: `frontend/**` 変更時のみビルド
- backend プロジェクト: `backend/**` 変更時のみビルド

これで不要な重複ビルドを防げる。

---

## 6. 主要コード例

### フレーム抽出 (クライアント側・dev.md より)

```typescript
// components/FrameExtractor.tsx
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

export async function extractFrames(
  videoFile: File,
  frameCount: number = 4
): Promise<string[]> {
  const ffmpeg = new FFmpeg();
  await ffmpeg.load();

  await ffmpeg.writeFile('input.mp4', await fetchFile(videoFile));

  await ffmpeg.exec([
    '-i', 'input.mp4',
    '-vf', `fps=1/${Math.floor(videoDuration / frameCount)}`,
    '-frames:v', String(frameCount),
    '-f', 'image2',
    'frame%d.jpg'
  ]);

  const frames: string[] = [];
  for (let i = 1; i <= frameCount; i++) {
    const data = await ffmpeg.readFile(`frame${i}.jpg`);
    const blob = new Blob([data], { type: 'image/jpeg' });
    frames.push(URL.createObjectURL(blob));
  }

  return frames;
}
```

### フロントからの API 呼び出し

```typescript
// frontend/src/lib/api.ts
const API_BASE = import.meta.env.VITE_API_URL || 'https://<worker>.<account>.workers.dev';

export async function analyzeFrames(frames: string[], userHint?: string) {
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frames, userHint }),
  });
  return res.json();
}

export async function generateThumbnail(prompt: string) {
  const res = await fetch(`${API_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  return res.json();
}
```

### Gemini でフレーム分析 (backend / Hono)

```typescript
// backend/src/index.ts の一部
import { Hono } from 'hono';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = new Hono();

app.post('/api/analyze', async (c) => {
  const { frames, userHint } = await c.req.json(); // framesはbase64配列

  const genAI = new GoogleGenerativeAI(c.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const imageParts = frames.map((base64: string) => ({
    inlineData: { data: base64, mimeType: 'image/jpeg' }
  }));

  const prompt = `
    これらは動画のキーフレームです。
    ${userHint ? `ユーザーのヒント: ${userHint}` : ''}
    
    以下を分析してください：
    1. 動画のジャンル・内容
    2. 主なビジュアル要素・雰囲気
    3. DALL-E 3用のサムネイル生成プロンプト(英語)
    
    JSON形式で返してください：
    { "analysis": "...", "prompt": "..." }
  `;

  const result = await model.generateContent([prompt, ...imageParts]);
  const text = result.response.text();

  return c.json(JSON.parse(text));
});
```

### 画像生成 (backend / Hono)

```typescript
app.post('/api/generate', async (c) => {
  const { prompt, style } = await c.req.json();
  const openai = new OpenAI({ apiKey: c.env.OPENAI_API_KEY });

  const enhancedPrompt = `
    YouTube thumbnail style, eye-catching, high contrast,
    bold composition, ${prompt},
    professional design, 16:9 aspect ratio feel
  `;

  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt: enhancedPrompt,
    size: '1792x1024',
    quality: 'standard',
    n: 1,
  });

  return c.json({ imageUrl: response.data[0].url });
});
```

### ffmpeg でクロスフェード (addition-function.md より・ブラウザ内)

```typescript
// 動画と動画をつなげる（AI不要・コスト0）
await ffmpeg.exec([
  '-i', 'video1.mp4',
  '-i', 'video2.mp4',
  '-filter_complex',
  '[0][1]xfade=transition=fade:duration=1:offset=4',
  'output.mp4'
]);
```

---

## 7. 追加機能の整理（addition-function.md より）

### 推奨判断

| 機能 | 推奨 | 理由 |
|------|------|------|
| **ffmpegトランジション** | ✅ やる | コスト0、制約なし、Cloudflare でもそのまま |
| **スライドショー動画** | ✅ やる | コスト0、ffmpeg.wasm で完結 |
| **AIトランジション** | ⚠️ 保留 | コスト↑（Runway 等）、Workers Paid + Queues で実装可能 |
| **AI動画生成** | ⚠️ 保留 | コスト↑、Workers Paid + Queues + R2 で実装可能 |

### Cloudflare での追加機能対応

| 機能 | Vercel での課題 | Cloudflare での対応 |
|------|-----------------|---------------------|
| 動画アップロード（数十MB） | 4.5MB 制限 | 100MB まで受け付け可能 |
| AI動画生成（30秒〜数分） | 10秒タイムアウト → Railway 必須 | Workers Paid で CPU 5分 + Queues で非同期処理 |
| 動画保存 | S3 等 別途 | R2 無料枠 10GB、エグレス無料 |

**方針**: まず ffmpeg ベースで機能を作り、後で AI オプションを追加する段階的アプローチ。

---

## 8. コスト試算

### 1回あたり（フェーズ1）

```
┌────────────────────────────────┐
│ フレーム抽出     : $0.00 (wasm) │
│ Gemini 1.5 Flash : ~$0.001      │
│ DALL-E 3 standard: $0.040       │
│ 合計            : ~$0.04/回     │
└────────────────────────────────┘

月100回 → 約$4 (約600円)
```

### フェーズ別 Cloudflare コスト

| フェーズ | 構成 | 月額固定費 |
|----------|------|------------|
| **1・2** | frontend (Pages Free) + backend (Workers Free) | 0円 |
| **3** | frontend (Pages Free) + backend (Workers Paid) + Queues + R2 | 約$5 (約750円) |

※ 分離構成でも frontend は Pages 無料枠のまま。Workers Paid は backend にのみ適用。

### コスト削減オプション

- 画像生成を安く: Replicate + Flux Schnell → $0.003/枚
- AI動画: Replicate Stable Video Diffusion → $0.003〜/秒

---

## 9. 主要サービス・制限メモ

| サービス | 無料枠 | 有料（Workers Paid $5/月〜） |
|----------|--------|------------------------------|
| **Workers** | 10万req/日、CPU 10ms | 2,000万req/月、CPU最大5分 |
| **Pages** | 500ビルド/月、20,000ファイル | カスタムドメイン多数 |
| **R2** | 10GB/月、100万ClassA、1,000万ClassB | 従量課金 |
| **Queues** | 利用可 | 利用可 |

---

## 10. 開発時の注意点（分離構成）

### フロントエンド (Pages)

1. **API の baseURL**: 環境変数 `VITE_API_URL` で backend の URL を指定
   - 本番: `https://<worker>.<account>.workers.dev` またはカスタムドメイン
   - 開発: `http://localhost:8787`（`wrangler dev` で backend をローカル起動時）

### バックエンド (Workers)

1. **環境変数**: Wrangler の `[vars]` または `wrangler secret put`（GEMINI_API_KEY, OPENAI_API_KEY 等）
2. **CORS**: フロントの Pages オリジン（`*.pages.dev` やカスタムドメイン）を許可するミドルウェアを追加
3. **認証**: Hono ミドルウェアで Cookie または Header チェック

### CORS 設定例（backend）

```typescript
// backend/src/index.ts
import { cors } from 'hono/cors';

app.use('/api/*', cors({
  origin: ['https://<project>.pages.dev', 'http://localhost:5173'],
  allowMethods: ['POST', 'GET'],
}));
```

### ローカル開発

- frontend: `cd frontend && npm run dev`（Vite デフォルト 5173）
- backend: `cd backend && npx wrangler dev`（デフォルト 8787）
- 両方起動し、フロントから `VITE_API_URL=http://localhost:8787` で backend に接続

---

## 11. 開発優先順位（分離構成）

```
Week 1:
  [ ] モノレポ構成で frontend / backend ディレクトリ作成
  [ ] frontend: Vite + React 雛形、Pages プロジェクト接続
  [ ] backend: Hono 雛形、Workers プロジェクト接続
  [ ] ffmpeg.wasm でフレーム抽出UI（frontend）
  [ ] Gemini API 接続テスト（backend /api/analyze）

Week 2:
  [ ] DALL-E 3 接続（backend /api/generate）
  [ ] CORS・環境変数設定
  [ ] E2Eフロー完成（frontend → backend API）
  [ ] frontend (Pages)・backend (Workers) それぞれデプロイ
```

---

## 12. 参考リンク

- [Cloudflare Workers 制限](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Pages 制限](https://developers.cloudflare.com/pages/platform/limits/)
- [Pages モノレポ](https://developers.cloudflare.com/pages/configuration/monorepos/)
- [Workers モノレポ・advanced setups](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/)
- [Hono + React テンプレート](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/)（一体構成の参考）
- [Cloudflare Queues](https://developers.cloudflare.com/queues/)
- [R2 料金](https://developers.cloudflare.com/r2/pricing/)
