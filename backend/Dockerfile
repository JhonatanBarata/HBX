FROM node:20
WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm install --no-audit --no-fund

# Copy source
COPY . .

# Prisma client generation (optional, ignore errors if not configured)
RUN npx prisma generate || true

EXPOSE 3000

# Sync schema (Postgres), regenerate Prisma Client, then start dev server (ts-node-dev)
CMD ["sh","-lc","npx prisma db push || true; npx prisma generate || true; npm run start:dev"]
