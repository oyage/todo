#!/bin/bash
# ==================================================
# Docker環境テストスクリプト
# ==================================================

set -e

echo "🧪 Docker環境の動作テストを開始します..."

# コンテナの状態確認
CONTAINER_ID=$(docker-compose ps -q todo-app 2>/dev/null || echo "")

if [ -z "$CONTAINER_ID" ]; then
    echo "❌ コンテナが見つかりません。アプリケーションを起動してください。"
    echo "   npm run docker:start"
    exit 1
fi

echo "✅ コンテナが実行中です: $CONTAINER_ID"

# HTTPアクセステスト
echo ""
echo "🌐 HTTPアクセステスト (port 3000)..."
if curl -s -f -m 10 http://localhost:3000 > /dev/null; then
    echo "✅ HTTP (port 3000): 正常"
else
    echo "❌ HTTP (port 3000): アクセス失敗"
fi

# HTTPSアクセステスト
echo ""
echo "🔒 HTTPSアクセステスト (port 3443)..."
if curl -s -f -k -m 10 https://localhost:3443 > /dev/null; then
    echo "✅ HTTPS (port 3443): 正常"
else
    echo "❌ HTTPS (port 3443): アクセス失敗"
    echo "   コンテナ内のHTTPSサーバー状況を確認します..."
    
    # コンテナ内でのポート確認
    echo "📋 コンテナ内でのポート状況:"
    docker exec $CONTAINER_ID netstat -tlnp 2>/dev/null | grep -E ":(3000|3443)" || echo "   ポート情報を取得できませんでした"
    
    # SSL証明書の確認
    echo ""
    echo "🔐 SSL証明書の確認:"
    if docker exec $CONTAINER_ID ls -la /app/ssl/ 2>/dev/null; then
        echo "   SSL証明書ファイルが存在します"
    else
        echo "   ❌ SSL証明書ファイルが見つかりません"
    fi
    
    # HTTPSサーバーの起動確認
    echo ""
    echo "📊 HTTPSサーバープロセス確認:"
    docker exec $CONTAINER_ID ps aux | grep node || echo "   Node.jsプロセス情報を取得できませんでした"
fi

# APIアクセステスト
echo ""
echo "🔌 API機能テスト..."

# Bearer token
BEARER_TOKEN="your-secret-token"

# HTTP API テスト
echo "HTTP API:"
if curl -s -f -H "Authorization: Bearer $BEARER_TOKEN" http://localhost:3000/tasks > /dev/null; then
    echo "✅ HTTP API: 正常"
else
    echo "❌ HTTP API: 認証または接続エラー"
fi

# HTTPS API テスト
echo "HTTPS API:"
if curl -s -f -k -H "Authorization: Bearer $BEARER_TOKEN" https://localhost:3443/tasks > /dev/null; then
    echo "✅ HTTPS API: 正常"
else
    echo "❌ HTTPS API: 認証または接続エラー"
fi

# ログの確認
echo ""
echo "📋 最新のコンテナログ（最後の20行）:"
docker logs --tail 20 $CONTAINER_ID

echo ""
echo "🏁 テスト完了！"
echo ""
echo "💡 問題がある場合は以下を確認してください："
echo "   1. SSL証明書が正しく生成されているか"
echo "   2. 環境変数BEARER_TOKENが正しく設定されているか"
echo "   3. ファイアウォールがポート3000,3443をブロックしていないか"
echo "   4. 他のプロセスが同じポートを使用していないか"