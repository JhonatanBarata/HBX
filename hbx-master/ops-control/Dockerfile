FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache docker-cli procps coreutils

COPY package*.json ./
RUN npm install --omit=dev

COPY server.js ./server.js
COPY public ./public

ENV OPS_CONTROL_PORT=3099
EXPOSE 3099

CMD ["npm", "start"]
