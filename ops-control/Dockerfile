FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache docker-cli procps coreutils

COPY package*.json ./
RUN npm install --omit=dev

COPY server.js ./server.js

# Anti-drift (D4, S3): grava NA IMAGEM o hash do código de ops-control/ e o instante do build (ARGs
# vindos do compose/invocador). O GET /api/build-info devolve isso; o HBX Owner compara com o hash
# local de ops-control/ e avisa "ops desatualizado — rebuild" quando a imagem rodando ficou pra trás
# (o buraco D4 de 30/06: imagem velha × código novo → rota 404 calada). Ficam por ÚLTIMO (depois do
# npm install/COPY) → trocar o hash só invalida estas 2 camadas triviais, o rebuild custa segundos.
ARG BUILD_GIT_HASH=unknown
ARG BUILD_AT=
ENV OPS_BUILD_GIT_HASH=$BUILD_GIT_HASH
ENV OPS_BUILD_AT=$BUILD_AT

ENV OPS_CONTROL_PORT=3099
EXPOSE 3099

CMD ["npm", "start"]
