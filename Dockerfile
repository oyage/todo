FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY . .

RUN mkdir -p /app/data

EXPOSE 3000

ENV NODE_ENV=production

CMD ["npm", "start"]