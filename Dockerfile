FROM node:20
WORKDIR /app
COPY backend/package*.json backend/
RUN cd backend && npm install
COPY backend backend
RUN cd backend && npm run build
EXPOSE 3000
CMD ["sh","-c","cd /app/backend && node -r ./scripts/fix-direct-url dist/main.js"]
