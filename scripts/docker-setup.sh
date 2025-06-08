#!/bin/bash
# ==================================================
# Docker環境セットアップスクリプト
# ==================================================

set -e

echo "🐳 Docker環境のセットアップを開始します..."

# 必要なディレクトリの作成
echo "📁 必要なディレクトリを作成しています..."
mkdir -p docker-data/data
mkdir -p docker-data/ssl
mkdir -p docker-data/logs

# 権限設定（非rootユーザー用）
echo "🔒 ディレクトリの権限を設定しています..."
sudo chown -R 1001:1001 docker-data/
chmod -R 755 docker-data/

# SSL証明書の生成（開発環境用）
if [ ! -f "docker-data/ssl/private.key" ] || [ ! -f "docker-data/ssl/cert.pem" ]; then
    echo "🔐 開発用SSL証明書を生成しています..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout docker-data/ssl/private.key \
        -out docker-data/ssl/cert.pem \
        -subj "/C=JP/ST=Tokyo/L=Tokyo/O=TodoApp/OU=Dev/CN=localhost"
    
    # SSL証明書の権限設定
    chmod 600 docker-data/ssl/private.key
    chmod 644 docker-data/ssl/cert.pem
    chown 1001:1001 docker-data/ssl/*
fi

# .env.dockerファイルの確認
if [ ! -f ".env.docker" ]; then
    echo "⚠️  .env.dockerファイルが見つかりません。"
    echo "   セキュリティ設定のためにファイルを作成してください。"
    exit 1
fi

# セキュリティ設定の確認
echo "🔍 セキュリティ設定をチェックしています..."

# デフォルトトークンの使用をチェック
if grep -q "your-secure-production-token-change-this" .env.docker; then
    echo "⚠️  警告: デフォルトのBEARER_TOKENが使用されています。"
    echo "   本番環境では必ず強力なトークンに変更してください。"
fi

# Docker Composeファイルの構文チェック
echo "📋 Docker Compose設定をチェックしています..."
docker-compose -f docker-compose.yml config > /dev/null

echo "✅ セットアップが完了しました！"
echo ""
echo "🚀 アプリケーションを起動するには:"
echo "   docker-compose --env-file .env.docker up -d"
echo ""
echo "🔍 ログを確認するには:"
echo "   docker-compose logs -f todo-app"
echo ""
echo "🛑 アプリケーションを停止するには:"
echo "   docker-compose down"
echo ""
echo "📊 セキュリティ監査を実行するには:"
echo "   ./scripts/docker-security-audit.sh"