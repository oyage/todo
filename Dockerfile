# セキュリティ強化されたNode.js Alpine Linux
FROM node:18-alpine

# セキュリティ: 非rootユーザーでアプリケーションを実行
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# 作業ディレクトリの設定
WORKDIR /app

# パッケージファイルのコピー（レイヤーキャッシュの最適化）
COPY package*.json ./

# セキュリティ: npm auditでセキュリティ脆弱性をチェック
RUN npm audit --audit-level=high && \
    npm ci --only=production --no-optional && \
    npm cache clean --force

# アプリケーションファイルのコピー
COPY --chown=nextjs:nodejs . .

# データディレクトリの作成と権限設定
RUN mkdir -p /app/data && \
    mkdir -p /app/ssl && \
    chown -R nextjs:nodejs /app && \
    chmod -R 755 /app/data && \
    chmod -R 755 /app/ssl

# セキュリティ: 不要なパッケージの削除
RUN apk del --no-cache \
    && rm -rf /var/cache/apk/* \
    && rm -rf /tmp/*

# HTTPとHTTPSポートの公開
EXPOSE 3000 3443

# 環境変数の設定
ENV NODE_ENV=production
ENV USER=nextjs

# セキュリティ: 非rootユーザーに切り替え
USER nextjs

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); \
    const options = { hostname: 'localhost', port: 3000, path: '/', method: 'HEAD' }; \
    const req = http.request(options, (res) => { \
      if (res.statusCode === 200) process.exit(0); \
      else process.exit(1); \
    }); \
    req.on('error', () => process.exit(1)); \
    req.end();"

# アプリケーションの起動
CMD ["npm", "start"]