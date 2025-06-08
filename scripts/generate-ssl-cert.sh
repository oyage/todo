#!/bin/bash

# 自己署名SSL証明書の生成スクリプト
# 開発環境用のSSL証明書を生成します

echo "🔐 開発環境用のSSL証明書を生成中..."

# SSL証明書ディレクトリの作成
mkdir -p ssl

# 秘密鍵の生成
openssl genrsa -out ssl/private.key 2048

# CSR（証明書署名要求）の生成
openssl req -new -key ssl/private.key -out ssl/cert.csr -subj "/C=JP/ST=Tokyo/L=Tokyo/O=TodoApp/OU=Development/CN=localhost"

# 自己署名証明書の生成
openssl x509 -req -days 365 -in ssl/cert.csr -signkey ssl/private.key -out ssl/cert.pem

# CSRファイルの削除（不要）
rm ssl/cert.csr

echo "✅ SSL証明書が生成されました:"
echo "  - 秘密鍵: ssl/private.key"
echo "  - 証明書: ssl/cert.pem"
echo ""
echo "⚠️  これは開発環境用の自己署名証明書です。"
echo "   本番環境では信頼できるCA（Let's Encrypt等）からの証明書を使用してください。"
echo ""
echo "🌐 HTTPSでアクセス: https://localhost:3443"