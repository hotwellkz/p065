FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY public ./public

# Порт настраивается через переменную окружения BACKEND_PORT или PORT (по умолчанию 3000)
# Приложение использует PORT, поэтому если задан BACKEND_PORT, он будет использован как PORT
ARG BACKEND_PORT=3000
ENV PORT=${BACKEND_PORT}

EXPOSE ${BACKEND_PORT}

CMD ["node", "dist/index.js"]







