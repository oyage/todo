#!/bin/bash
# ==================================================
# Docker起動用簡易スクリプト
# ==================================================

set -e

echo "🐳 Dockerでアプリケーションを起動します..."

# 現在のディレクトリが正しいかチェック
if [ ! -f "package.json" ]; then
    echo "❌ package.jsonが見つかりません。プロジェクトのルートディレクトリで実行してください。"
    exit 1
fi

# 必要なディレクトリの作成（権限問題を避けるため）
echo "📁 必要なディレクトリを作成しています..."
mkdir -p docker-data/data
mkdir -p docker-data/ssl
mkdir -p docker-data/logs

# .env.dockerファイルの存在確認
if [ ! -f ".env.docker" ]; then
    echo "⚠️  .env.dockerファイルが見つかりません。"
    echo "   デフォルトのファイルを作成します..."
    
    cat > .env.docker << 'EOF'
# Docker環境用設定
NODE_ENV=production
BEARER_TOKEN=your-secret-token
ALLOWED_ORIGINS=http://localhost:3000,https://localhost:3443
ENABLE_HTTPS_REDIRECT=false
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX=5
LOG_LEVEL=info
EOF
    echo "   .env.dockerファイルを作成しました。"
fi

# SSL証明書の生成（必要な場合）
if [ ! -f "docker-data/ssl/private.key" ] || [ ! -f "docker-data/ssl/cert.pem" ]; then
    echo "🔐 開発用SSL証明書を生成しています..."
    
    # OpenSSLの存在確認
    if ! command -v openssl &> /dev/null; then
        echo "⚠️  OpenSSLがインストールされていません。"
        echo "   Ubuntu/Debian: sudo apt-get install openssl"
        echo "   CentOS/RHEL: sudo yum install openssl"
        echo "   macOS: brew install openssl"
        echo "   Windows: SSL証明書生成をスキップします..."
    else
        # 詳細なSSL証明書設定でSAN（Subject Alternative Name）を追加
        cat > docker-data/ssl/openssl.conf << EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = JP
ST = Tokyo
L = Tokyo
O = TodoApp
OU = Development
CN = localhost

[v3_req]
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.localhost
IP.1 = 127.0.0.1
IP.2 = 0.0.0.0
EOF

        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout docker-data/ssl/private.key \
            -out docker-data/ssl/cert.pem \
            -config docker-data/ssl/openssl.conf \
            -extensions v3_req 2>/dev/null
        
        # SSL証明書の権限設定（Docker用）
        chmod 644 docker-data/ssl/private.key  # コンテナ内のUID 1001が読めるように
        chmod 644 docker-data/ssl/cert.pem
        
        # 可能であればUID 1001の所有者に変更
        if command -v chown &> /dev/null; then
            chown 1001:1001 docker-data/ssl/private.key docker-data/ssl/cert.pem 2>/dev/null || true
        fi
        
        echo "   SSL証明書を生成しました（SAN対応、Docker権限設定済み）。"
        
        # 一時設定ファイルを削除
        rm -f docker-data/ssl/openssl.conf
    fi
else
    echo "✅ SSL証明書が既に存在します。"
    
    # 既存証明書の権限確認・修正
    echo "🔒 既存SSL証明書の権限を確認・調整しています..."
    chmod 644 docker-data/ssl/private.key 2>/dev/null || true
    chmod 644 docker-data/ssl/cert.pem 2>/dev/null || true
    
    # 可能であればUID 1001の所有者に変更
    if command -v chown &> /dev/null; then
        chown 1001:1001 docker-data/ssl/private.key docker-data/ssl/cert.pem 2>/dev/null || true
    fi
    
    echo "   既存SSL証明書の権限を調整しました。"
fi

# Dockerの状態確認
echo "🔍 Docker環境をチェックしています..."

if ! command -v docker &> /dev/null; then
    echo "❌ Dockerがインストールされていません。"
    echo "   https://docs.docker.com/get-docker/ を参照してDockerをインストールしてください。"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Composeがインストールされていません。"
    echo "   https://docs.docker.com/compose/install/ を参照してDocker Composeをインストールしてください。"
    exit 1
fi

# Dockerサービスの確認
if ! docker info &> /dev/null; then
    echo "❌ Dockerサービスが実行されていません。"
    echo "   以下のコマンドでDockerサービスを開始してください："
    echo "   sudo systemctl start docker"
    exit 1
fi

# Docker Composeの構文チェック
echo "📋 Docker Compose設定をチェックしています..."
if ! docker-compose -f docker-compose.simple.yml config &> /dev/null; then
    echo "❌ docker-compose.simple.ymlに問題があります。"
    echo "   元のdocker-compose.ymlを試します..."
    if ! docker-compose -f docker-compose.yml config &> /dev/null; then
        echo "❌ docker-compose.ymlにも問題があります。"
        exit 1
    fi
    COMPOSE_FILE="docker-compose.yml"
else
    COMPOSE_FILE="docker-compose.simple.yml"
fi

# 既存のコンテナを停止（存在する場合）
echo "🛑 既存のコンテナを停止しています..."
docker-compose -f "$COMPOSE_FILE" down &> /dev/null || true

# アプリケーションのビルドと起動
echo "🚀 アプリケーションをビルド・起動しています ($COMPOSE_FILE)..."
docker-compose -f "$COMPOSE_FILE" --env-file .env.docker up --build -d

# 起動待機
echo "⏳ アプリケーションの起動を待機しています..."
sleep 10

# ヘルスチェック
echo "🏥 ヘルスチェックを実行しています..."
if docker-compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
    echo "✅ アプリケーションが正常に起動しました！"
    echo ""
    echo "🌐 アクセスURL:"
    echo "   HTTP:  http://localhost:3000"
    echo "   HTTPS: https://localhost:3443 (SSL証明書の警告は無視してください)"
    echo ""
    echo "📋 管理コマンド:"
    echo "   ログ確認: docker-compose -f $COMPOSE_FILE logs -f todo-app"
    echo "   停止:     docker-compose -f $COMPOSE_FILE down"
    echo "   再起動:   docker-compose -f $COMPOSE_FILE restart"
else
    echo "❌ アプリケーションの起動に失敗しました。"
    echo "   ログを確認してください: docker-compose -f $COMPOSE_FILE logs todo-app"
    exit 1
fi