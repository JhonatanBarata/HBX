FROM node:20
WORKDIR /app
COPY backend/package*.json backend/
RUN cd backend && npm install
COPY backend backend
RUN cd backend && npm run build
EXPOSE 3000
CMD ["node","backend/dist/main.js"]
