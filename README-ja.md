# TODOアプリケーション

このリポジトリはシンプルなウェブベースのTODOマネージャーを提供します。タスクはSQLiteデータベースに保存されます。

## ウェブ版（Node.js/Express）

1. 依存関係をインストール：

```bash
npm install
```

2. サーバーを起動：

```bash
npm start
```

デフォルトでサーバーは<http://localhost:3000>で動作します。別のポートを使用する場合は、`PORT`環境変数を設定してください：

```bash
PORT=4000 npm start
```

## 認証

アプリケーションはBearer Token認証を使用します。`BEARER_TOKEN`環境変数を設定してください：

```bash
BEARER_TOKEN=your-secret-token npm start
```

設定されていない場合、デフォルトトークン`your-secret-token`が使用されます。フロントエンドはこのトークンで事前設定されています。

アプリは`public/`ディレクトリからHTMLフロントエンドを提供します。ページを使用してタスクの追加、編集、削除を行ってください。

## Docker対応

Docker Composeで実行：

```bash
docker-compose up
```

## テスト

テストを実行：

```bash
npm test
```

## ファイル概要

- `server.js` – REST APIを公開するExpressサーバー
- `database.js` – SQLiteデータベース操作
- `public/index.html` – ウェブ版のフロントエンド
- `tasks.db` – タスクを保存するSQLiteデータベース
- `test/server.test.js` – APIエンドポイントのテスト
- `CLAUDE.md` – プロジェクトに関する追加メモ

## 機能

- 新しいタスクの追加
- 既存タスクの編集
- タスクの削除
- SQLiteによる永続化ストレージ
- Bearer Token認証
- 完全なテストカバレッジ

## アーキテクチャ

Express.jsとSQLiteで構築されたシンプルなウェブベースTODOアプリケーション：

- `server.js`: CRUD操作のエンドポイントを持つREST APIサーバー
- `database.js`: SQLiteデータベース操作モジュール
- `public/index.html`: JavaScriptを使用したシングルページフロントエンド
- APIエンドポイント: GET/POST `/tasks`、PUT `/tasks/:id`、DELETE `/tasks/:id`
- `tasks.db`: タスクを保存するSQLiteデータベース
- `test/server.test.js`: APIエンドポイントテスト

ウェブサーバーはポート3000で動作し、`public/`ディレクトリから静的ファイルを提供します。