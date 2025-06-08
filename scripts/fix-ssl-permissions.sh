#!/bin/bash
# ==================================================
# SSL証明書権限修正スクリプト
# ==================================================

echo "🔧 SSL証明書の権限問題を修正します..."

# SSL証明書ディレクトリの確認
if [ ! -d "docker-data/ssl" ]; then
    echo "❌ docker-data/ssl ディレクトリが見つかりません。"
    echo "   先に npm run docker:start を実行してください。"
    exit 1
fi

# 既存のSSL証明書ファイルを削除
echo "🗑️  既存のSSL証明書を削除しています..."
rm -f docker-data/ssl/private.key
rm -f docker-data/ssl/cert.pem

# 新しいSSL証明書を適切な権限で生成
echo "🔐 新しいSSL証明書を生成しています..."

if command -v openssl &> /dev/null; then
    # OpenSSL設定ファイルの作成
    cat > docker-data/ssl/openssl.conf << 'EOF'
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

    # SSL証明書の生成
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout docker-data/ssl/private.key \
        -out docker-data/ssl/cert.pem \
        -config docker-data/ssl/openssl.conf \
        -extensions v3_req 2>/dev/null

    # Docker用の権限設定（読み取り可能にする）
    chmod 644 docker-data/ssl/private.key
    chmod 644 docker-data/ssl/cert.pem

    # 所有者をUID 1001に設定（可能であれば）
    if command -v chown &> /dev/null; then
        chown 1001:1001 docker-data/ssl/private.key docker-data/ssl/cert.pem 2>/dev/null || {
            echo "⚠️  所有者変更に失敗しました（権限不足）。問題ない場合があります。"
        }
    fi

    # 一時ファイルの削除
    rm -f docker-data/ssl/openssl.conf

    echo "✅ SSL証明書を再生成しました。"
    echo ""
    echo "📋 生成されたファイル:"
    ls -la docker-data/ssl/
    echo ""
    echo "🚀 Docker コンテナを再起動してください:"
    echo "   npm run docker:down"
    echo "   npm run docker:start"

else
    echo "❌ OpenSSLがインストールされていません。"
    echo "   Ubuntu/Debian: sudo apt-get install openssl"
    echo "   CentOS/RHEL: sudo yum install openssl"
    echo "   macOS: brew install openssl"
    exit 1
fi