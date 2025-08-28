# ArxivCaster 自動配信ワークフロー 仕様書（ドキュメント版）

---

## 1. プロジェクト概要

**目的**：arXiv に毎日公開される論文から最新のものを取得し、要約 → 台本化 → 音声変換（TTS）→ 記事生成 → RSS 更新 → GitHub Pages で公開 → Spotify Podcast へ自動配信、までを一連のワークフローとして自動化する。

**特徴**：

* LangChain + LangGraph によるフロー設計
* GitHub Actions による毎日自動実行（JST 23:00）
* 記事は Markdown / RSS / 音声ファイルを自動生成
* Spotify へは RSS を一度登録しておけば自動反映

---

## 2. ワークフロー全体像

1. **arXiv 検索**：カテゴリやキーワードで新着論文を取得
2. **要約生成**：論文の背景・課題・手法・結果・限界を日本語で Markdown 要約
3. **台本生成**：Podcast 向けに 500–900 字程度の口語文に変換
4. **音声合成**：TTS で MP3 に変換し `public/episodes/` に保存
5. **記事生成**：Markdown 記事を生成し、音声を埋め込み、台本を全文掲載
6. **RSS 更新**：`public/podcast.xml` に `<item>` を追加
7. **公開**：GitHub Actions が `public/` をコミットし Pages へ公開
8. **Spotify 反映**：RSS を Spotify for Podcasters に登録済みなら自動配信

---

## 3. 実行環境

* **ホスティング**：GitHub Pages
* **自動実行**：GitHub Actions（cron: 0 14 \* \* \* → JST 23:00）
* **依存サービス**：OpenAI API（LLM + TTS）、arXiv API（RSS/Atom）
* **ディレクトリ構成**：

  * `app/` （ノードとグラフ定義）
  * `public/` （生成物：記事、音声、RSS）
  * `.github/workflows/` （CI/CD 設定）

---

## 4. 仕様詳細

### 入力

* 環境変数 `ARXIV_QUERY`：検索クエリ（例: `cat:cs.LG`）
* 環境変数 `ARXIV_MAX`：最大件数（既定1）
* 環境変数 `OPENAI_API_KEY`：LLM/TTS用
* 環境変数 `SITE_BASE_URL`：サイトの公開 URL

### 出力

* `public/episodes/YYYYMMDD.mp3`：音声ファイル
* `public/posts/YYYYMMDD.md`：記事ファイル
* `public/podcast.xml`：RSS フィード（毎回 `<item>` が追加）

### 冪等性

* 同一日 slug（YYYYMMDD）が存在する場合はスキップ

---

## 5. RSS 仕様

* RSS 2.0 準拠
* `<channel>`：番組情報（タイトル・説明・言語・リンク）
* `<item>`：毎日のエピソード

  * `<title>` 論文タイトル
  * `<description>` 要約
  * `<enclosure url="..." type="audio/mpeg">` 音声リンク
  * `<pubDate>` 公開日時（UTC）
  * `<guid>` 一意のID

---

## 6. 運用ルール

* **引用の明示**：論文タイトル・著者・arXiv リンクを必ず記事と台本に含める
* **著作権配慮**：論文本文や図は転載せず、必要なら要約・リンクで対応
* **品質ゲート**：必ず「限界 / 今後の展望」を要約に含める
* **失敗時**：ノード例外時にジョブは失敗し、ログで原因特定可能

---

## 7. 拡張の方向性

* スコアリングで注目度の高い論文を優先
* 日本語/英語の二言語記事生成
* Qiita / Zenn へのクロスポスト
* サムネイル画像の自動生成と記事への埋め込み

---

## 8. 初回セットアップ手順

1. リポジトリ作成 → 本仕様に従いディレクトリ用意
2. `public/podcast.xml` の初期テンプレを設置
3. GitHub Secrets に `OPENAI_API_KEY`, `ARXIV_QUERY`, `SITE_BASE_URL` を登録
4. GitHub Pages を有効化
5. Spotify for Podcasters に RSS を登録
6. `workflow_dispatch` で一度手動実行 → 記事・音声・RSS の生成を確認
