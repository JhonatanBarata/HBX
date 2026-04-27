FROM node:20

ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    npm_config_update_notifier=false

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --no-audit --no-fund --loglevel=error

COPY backend/ ./

RUN npx prisma generate --schema=./prisma/schema.prisma --no-hints
RUN npm run build

EXPOSE 3000

CMD ["sh", "-lc", "npx prisma migrate deploy --schema=./prisma/schema.prisma && npm run start:prod"]
