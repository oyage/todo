# TODOアプリケーション

包括的なタスク管理機能を備えたセキュアなウェブベースTODOマネージャー。Express.jsとSQLiteで構築され、Bearer Token認証、HTTPS対応、Dockerデプロイメント機能を搭載。

## 機能

- **タスク管理**: 優先度、期限、カテゴリを持つタスクの追加・編集・削除
- **一括操作**: 複数タスクの同時選択・管理
- **高度なUI**: 検索、カテゴリフィルター、優先度・日付でのソート
- **チェックボックス**: 個別・一括でのタスク完了状態切り替え
- **永続化ストレージ**: 自動初期化対応のSQLiteデータベース
- **セキュリティ**: Bearer Token認証、CORS、レート制限、HTTPS対応
- **Docker対応**: セキュリティ強化されたプロダクション対応コンテナ

## クイックスタート

### Node.js/Express

1. 依存関係をインストール：
```bash
npm install
```

2. サーバーを起動：
```bash
npm start
```

デフォルトで<http://localhost:3000>で動作。別ポートを使用する場合は`PORT`環境変数を設定：
```bash
PORT=4000 npm start
```

### Docker（推奨）

セキュリティ強化機能付きで起動：
```bash
npm run docker:start
```

その他のDockerコマンド：
```bash
# 標準デプロイメント
npm run docker:up

# 簡易デプロイメント（名前付きボリューム）
npm run docker:up-simple

# ログ確認
npm run docker:logs

# HTTP/HTTPSアクセステスト
npm run docker:test

# SSL権限の修正（必要に応じて）
npm run docker:fix-ssl

# セキュリティ監査
npm run docker:security-audit

# サービス停止
npm run docker:down
```

## 認証

全APIエンドポイントでBearer Token認証が必要：

```bash
BEARER_TOKEN=your-secret-token npm start
```

未設定の場合はデフォルトトークン`your-secret-token`を使用。フロントエンドはこのトークンで事前設定済み。

## APIエンドポイント

- `GET/POST /tasks` - タスク一覧取得/作成
- `PUT /tasks/:id` - タスク更新
- `DELETE /tasks/:id` - タスク削除
- `PATCH /tasks/:id/toggle` - タスク完了状態切り替え
- `POST /tasks/bulk-delete` - 複数タスク削除
- `POST /tasks/bulk-complete` - 複数タスク完了

## セキュリティ機能

- **認証**: Bearer Token検証
- **HTTPS**: 自動生成証明書によるSSL/TLS暗号化
- **CORS**: ホワイトリスト対応クロスオリジンリクエスト保護
- **レート制限**: API・認証エンドポイント保護
- **セキュリティヘッダー**: Helmet.js統合（CSP、HSTS、XSS保護）
- **Dockerセキュリティ**: 非root実行、権限制限、リソース制限

## テスト

包括的テストスイートの実行：
```bash
npm test
```

テストは一時的な`test.db`ファイルを作成し、終了後に自動削除されます。

## アーキテクチャ

- `server.js` – セキュリティミドルウェア付きExpress REST APIサーバー
- `database.js` – SQLiteデータベース操作モジュール
- `public/index.html` – 高度なタスク管理機能を持つシングルページフロントエンド
- `public/sw.js` – オフライン機能用サービスワーカー
- `test/server.test.js` – 完全なAPIエンドポイントテストカバレッジ
- `tasks.db` – SQLiteデータベース（自動作成）
- `ssl/` – HTTPS用SSL証明書
- `docker-data/` – Docker永続ボリューム

## 開発

アプリケーションは初回起動時に`tasks.db`を自動作成。フロントエンドは`public/`ディレクトリから提供され、検索、フィルタリング、一括操作、レスポンシブデザインを含む完全なタスク管理機能を備えています。

詳細な開発ガイドラインは`CLAUDE.md`、セキュリティドキュメントは`SECURITY.md`を参照してください。