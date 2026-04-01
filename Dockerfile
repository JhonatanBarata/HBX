FROM node:20

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --no-audit --no-fund

COPY backend/ ./

RUN npx prisma generate --schema=./prisma/schema.prisma
RUN npm run build

EXPOSE 3000

CMD ["sh", "-lc", "npx prisma migrate deploy --schema=./prisma/schema.prisma && npm run start:prod"]