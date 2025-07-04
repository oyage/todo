# セキュリティガイド

## 実装されたセキュリティ機能

### 1. CORS（Cross-Origin Resource Sharing）設定
- ✅ 許可されたオリジンのホワイトリスト管理
- ✅ 開発環境と本番環境での異なる設定
- ✅ 環境変数による動的オリジン設定
- ✅ プリフライトリクエストの適切な処理

### 2. セキュリティヘッダー（Helmet.js）
- ✅ Content Security Policy (CSP)
- ✅ X-Content-Type-Options: nosniff
- ✅ X-Frame-Options: DENY
- ✅ X-XSS-Protection: 1; mode=block
- ✅ Strict-Transport-Security (HSTS)
- ✅ Referrer-Policy

### 3. Rate Limiting
- ✅ 一般APIエンドポイント: 15分間で100リクエスト
- ✅ 認証エンドポイント: 15分間で5リクエスト
- ✅ 環境に応じた制限値の調整

### 4. HTTPS対応
- ✅ 自動SSL証明書の生成スクリプト
- ✅ HTTP/HTTPSサーバーの同時実行
- ✅ 本番環境でのHTTPSリダイレクト

### 5. 認証・認可
- ✅ JWT認証システム（推奨）
- ✅ Bearer Token認証（後方互換性）
- ✅ bcryptによるパスワードハッシュ化
- ✅ 設定可能なトークン有効期限
- ✅ 強化されたトークン検証
- ✅ 認証失敗の詳細ログ

### 6. パフォーマンスセキュリティ
- ✅ LRUキャッシュによるメモリ効率化
- ✅ データベースクエリ最適化
- ✅ レスポンス圧縮によるデータ転送最小化
- ✅ メモリ使用量監視と自動クリーンアップ

## セキュリティベストプラクティス

### 開発環境
```bash
# SSL証明書の生成
npm run generate-ssl-cert

# HTTPSサーバーの起動
npm run start:https

# セキュリティ監査
npm run security-check
```

### 本番環境
```bash
# 環境変数の設定（.env.exampleから安全なトークンを使用）
export NODE_ENV=production
export BEARER_TOKEN=<.env.exampleの64文字トークン>
export JWT_SECRET=<.env.exampleの128文字シークレット>
export JWT_EXPIRES_IN=24h
export ALLOWED_ORIGINS=https://yourdomain.com
export ENABLE_HTTPS_REDIRECT=true

# パフォーマンス設定
export CACHE_TTL=300000
export ENABLE_COMPRESSION=true
export RATE_LIMIT_MAX_REQUESTS=100

# 本番サーバーの起動
npm run start:prod
```

## 環境変数

以下の環境変数を適切に設定してください：

| 変数名 | 説明 | デフォルト値 | 必須 |
|--------|------|-------------|------|
| `NODE_ENV` | 実行環境 | development | ❌ |
| `BEARER_TOKEN` | API認証トークン（64文字） | .env.exampleを使用 | ✅ |
| `JWT_SECRET` | JWT署名キー（128文字） | .env.exampleを使用 | ✅ |
| `JWT_EXPIRES_IN` | JWTトークン有効期限 | 24h | ❌ |
| `ALLOWED_ORIGINS` | 許可オリジン | localhost系 | ❌ |
| `ENABLE_HTTPS_REDIRECT` | HTTPSリダイレクト | false | ❌ |
| `RATE_LIMIT_MAX_REQUESTS` | Rate Limit上限 | 1000（dev）/100（prod） | ❌ |
| `CACHE_TTL` | キャッシュ有効期限 | 300000（5分） | ❌ |
| `ENABLE_COMPRESSION` | gzip圧縮 | true | ❌ |

## セキュリティチェックリスト

### 🔒 本番環境デプロイ前
- [ ] 強力なBEARER_TOKEN（64文字）の設定
- [ ] 強力なJWT_SECRET（128文字）の設定
- [ ] ALLOWED_ORIGINSの適切な設定
- [ ] SSL証明書の正しい配置
- [ ] HTTPS_REDIRECTの有効化
- [ ] Rate Limitingの値確認（本番用に100に設定）
- [ ] セキュリティヘッダーの検証
- [ ] パフォーマンス設定の最適化
- [ ] キャッシュ設定の確認

### 🛡️ 定期的なメンテナンス
- [ ] 依存関係の脆弱性チェック (`npm audit`)
- [ ] SSL証明書の更新
- [ ] ログの監視
- [ ] 異常なトラフィックの検出

## 脆弱性報告

セキュリティ上の問題を発見した場合は、以下の手順で報告してください：

1. **公開しない**: GitHubのIssueやPull Requestで報告しない
2. **直接連絡**: 開発チームに直接連絡
3. **詳細提供**: 再現手順と影響範囲を明記

## Docker環境のセキュリティ

### セキュリティ機能
- ✅ 非rootユーザーでの実行
- ✅ Linux Capabilitiesの最小化
- ✅ リソース制限の設定
- ✅ セキュアなネットワーク設定
- ✅ ヘルスチェック機能
- ✅ ログローテーション
- ✅ tmpfsによるセキュアな一時ファイル管理

### Docker環境の構築

```bash
# セットアップスクリプトの実行
./scripts/docker-setup.sh

# アプリケーションの起動
docker-compose --env-file .env.docker up -d

# セキュリティ監査の実行
./scripts/docker-security-audit.sh
```

### Docker環境変数

| 変数名 | 説明 | デフォルト値 | 必須 |
|--------|------|-------------|------|
| `BEARER_TOKEN` | API認証トークン | your-secure-production-token-change-this | ✅ |
| `ALLOWED_ORIGINS` | 許可オリジン | localhost系 | ❌ |
| `ENABLE_HTTPS_REDIRECT` | HTTPSリダイレクト | false | ❌ |
| `RATE_LIMIT_MAX_REQUESTS` | Rate Limit上限 | 100 | ❌ |
| `AUTH_RATE_LIMIT_MAX` | 認証Rate Limit | 5 | ❌ |

### セキュリティベストプラクティス

#### 🔒 本番環境での必須設定
- [ ] BEARER_TOKENの変更（強力なランダム文字列）
- [ ] ALLOWED_ORIGINSの適切な設定
- [ ] SSL証明書の正しい配置
- [ ] ログ監視の設定
- [ ] 定期的なイメージ更新

#### 🛡️ 監視項目
- [ ] コンテナのリソース使用量
- [ ] 異常なAPIアクセス
- [ ] ヘルスチェックの状態
- [ ] セキュリティアップデート

## 参考資料

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Checklist](https://blog.risingstack.com/node-js-security-checklist/)
- [Express.js Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)