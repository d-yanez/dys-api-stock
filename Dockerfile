# Dockerfile para dys-api-stock
FROM node:20-slim

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

COPY . .

ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["node", "src/app.js"]
