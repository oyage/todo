#!/bin/bash
# ==================================================
# ブラウザ対応SSL証明書生成スクリプト
# ==================================================

echo "🔐 ブラウザ対応のSSL証明書を生成します..."

# 出力ディレクトリの確認
SSL_DIR="docker-data/ssl"
if [ ! -d "$SSL_DIR" ]; then
    mkdir -p "$SSL_DIR"
fi

# 既存の証明書をバックアップ
if [ -f "$SSL_DIR/private.key" ]; then
    echo "📋 既存の証明書をバックアップしています..."
    mv "$SSL_DIR/private.key" "$SSL_DIR/private.key.backup.$(date +%s)" 2>/dev/null || true
    mv "$SSL_DIR/cert.pem" "$SSL_DIR/cert.pem.backup.$(date +%s)" 2>/dev/null || true
fi

# 拡張されたOpenSSL設定ファイルの作成
cat > "$SSL_DIR/browser-ssl.conf" << 'EOF'
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
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth, clientAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.localhost
DNS.3 = 127.0.0.1
DNS.4 = 0.0.0.0
IP.1 = 127.0.0.1
IP.2 = 0.0.0.0
IP.3 = ::1
EOF

echo "🔧 ブラウザ互換性の高いSSL証明書を生成しています..."

# SSL証明書の生成
if command -v openssl &> /dev/null; then
    # RSA 2048bitの秘密鍵を生成
    openssl genrsa -out "$SSL_DIR/private.key" 2048 2>/dev/null
    
    # CSR（証明書署名要求）を生成
    openssl req -new \
        -key "$SSL_DIR/private.key" \
        -out "$SSL_DIR/cert.csr" \
        -config "$SSL_DIR/browser-ssl.conf" 2>/dev/null
    
    # 自己署名証明書を生成（有効期限1年）
    openssl x509 -req \
        -days 365 \
        -in "$SSL_DIR/cert.csr" \
        -signkey "$SSL_DIR/private.key" \
        -out "$SSL_DIR/cert.pem" \
        -extensions v3_req \
        -extfile "$SSL_DIR/browser-ssl.conf" 2>/dev/null
    
    # 一時ファイルの削除
    rm -f "$SSL_DIR/cert.csr" "$SSL_DIR/browser-ssl.conf"
    
    # 権限設定（Docker用）
    chmod 644 "$SSL_DIR/private.key"
    chmod 644 "$SSL_DIR/cert.pem"
    
    # 所有者設定（可能であれば）
    if command -v chown &> /dev/null; then
        chown 1001:1001 "$SSL_DIR/private.key" "$SSL_DIR/cert.pem" 2>/dev/null || true
    fi
    
    echo "✅ ブラウザ対応SSL証明書を生成しました！"
    echo ""
    echo "📋 生成されたファイル:"
    ls -la "$SSL_DIR/"
    echo ""
    echo "🔍 証明書の詳細:"
    openssl x509 -in "$SSL_DIR/cert.pem" -noout -text | grep -A 10 "Subject Alternative Name" || echo "   SAN情報の表示に失敗"
    echo ""
    echo "⚠️  ブラウザでアクセスする際の注意:"
    echo "   1. https://localhost:3443 にアクセス"
    echo "   2. 証明書警告が表示される場合は「詳細設定」→「安全でないサイトに移動」をクリック"
    echo "   3. Chrome: 「この安全でない接続を使用する」"
    echo "   4. Firefox: 「リスクを理解した上で接続するには」→「例外を追加」"
    echo ""
    echo "🚀 Docker コンテナを再起動してください:"
    echo "   npm run docker:down-simple"
    echo "   npm run docker:up-simple"
    
else
    echo "❌ OpenSSLがインストールされていません。"
    echo "   Ubuntu/Debian: sudo apt-get install openssl"
    echo "   CentOS/RHEL: sudo yum install openssl"
    echo "   macOS: brew install openssl"
    exit 1
fi