FROM node:24-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY gateway.ts ./gateway.ts

CMD ["node", "gateway.ts"]
