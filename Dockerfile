# Dockerfile para dys-api-stock
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["node", "src/app.js"]
