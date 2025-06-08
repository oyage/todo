#!/bin/bash
# ==================================================
# Dockerセキュリティ監査スクリプト
# ==================================================

set -e

echo "🔍 Dockerセキュリティ監査を開始します..."
echo ""

# Docker Bench for Securityのチェック
echo "📋 Docker設定のセキュリティチェック..."

# コンテナが実行中かチェック
if [ "$(docker-compose ps -q todo-app)" ]; then
    CONTAINER_ID=$(docker-compose ps -q todo-app)
    echo "✅ コンテナが実行中です: $CONTAINER_ID"
else
    echo "⚠️  コンテナが実行されていません。先にアプリケーションを起動してください。"
    exit 1
fi

echo ""
echo "🔐 セキュリティ設定の確認..."

# 1. 非rootユーザーで実行されているかチェック
echo "1. ユーザー権限のチェック:"
USER_CHECK=$(docker exec $CONTAINER_ID whoami)
if [ "$USER_CHECK" != "root" ]; then
    echo "   ✅ 非rootユーザーで実行: $USER_CHECK"
else
    echo "   ❌ rootユーザーで実行されています（セキュリティリスク）"
fi

# 2. 読み取り専用ファイルシステムのチェック
echo ""
echo "2. ファイルシステム権限のチェック:"
RO_CHECK=$(docker inspect $CONTAINER_ID --format='{{.HostConfig.ReadonlyRootfs}}')
if [ "$RO_CHECK" = "true" ]; then
    echo "   ✅ 読み取り専用ファイルシステム"
else
    echo "   ⚠️  読み書き可能ファイルシステム（SQLiteのため許可）"
fi

# 3. Capabilitiesのチェック
echo ""
echo "3. Linux Capabilitiesのチェック:"
CAP_ADD=$(docker inspect $CONTAINER_ID --format='{{.HostConfig.CapAdd}}')
CAP_DROP=$(docker inspect $CONTAINER_ID --format='{{.HostConfig.CapDrop}}')
echo "   追加されたCapabilities: $CAP_ADD"
echo "   削除されたCapabilities: $CAP_DROP"

# 4. ポート設定のチェック
echo ""
echo "4. ポート設定のチェック:"
PORTS=$(docker port $CONTAINER_ID)
echo "   公開ポート:"
echo "$PORTS" | sed 's/^/     /'

# 5. 環境変数のセキュリティチェック
echo ""
echo "5. 環境変数のセキュリティチェック:"
if docker exec $CONTAINER_ID env | grep -q "BEARER_TOKEN=your-secure-production-token"; then
    echo "   ❌ デフォルトのBEARER_TOKENが使用されています"
else
    echo "   ✅ BEARER_TOKENがカスタム値に設定されています"
fi

# 6. ネットワーク設定のチェック
echo ""
echo "6. ネットワーク設定のチェック:"
NETWORK_MODE=$(docker inspect $CONTAINER_ID --format='{{.HostConfig.NetworkMode}}')
echo "   ネットワークモード: $NETWORK_MODE"

# 7. リソース制限のチェック
echo ""
echo "7. リソース制限のチェック:"
MEMORY_LIMIT=$(docker inspect $CONTAINER_ID --format='{{.HostConfig.Memory}}')
CPU_LIMIT=$(docker inspect $CONTAINER_ID --format='{{.HostConfig.CpuQuota}}')
echo "   メモリ制限: $MEMORY_LIMIT bytes"
echo "   CPU制限: $CPU_LIMIT"

# 8. ヘルスチェックの状態
echo ""
echo "8. ヘルスチェックの状態:"
HEALTH_STATUS=$(docker inspect $CONTAINER_ID --format='{{.State.Health.Status}}')
echo "   ヘルスチェック状態: $HEALTH_STATUS"

# 9. ログ設定のチェック
echo ""
echo "9. ログ設定のチェック:"
LOG_DRIVER=$(docker inspect $CONTAINER_ID --format='{{.HostConfig.LogConfig.Type}}')
LOG_OPTIONS=$(docker inspect $CONTAINER_ID --format='{{.HostConfig.LogConfig.Config}}')
echo "   ログドライバー: $LOG_DRIVER"
echo "   ログオプション: $LOG_OPTIONS"

# 10. セキュリティオプションのチェック
echo ""
echo "10. セキュリティオプションのチェック:"
SECURITY_OPT=$(docker inspect $CONTAINER_ID --format='{{.HostConfig.SecurityOpt}}')
echo "    セキュリティオプション: $SECURITY_OPT"

echo ""
echo "🔒 セキュリティ監査完了！"
echo ""
echo "📝 推奨事項:"
echo "   - デフォルトのBEARER_TOKENを変更してください"
echo "   - 本番環境ではHTTPSリダイレクトを有効にしてください"
echo "   - 定期的にDocker imageを更新してください"
echo "   - ログを監視し、異常なアクセスを検出してください"