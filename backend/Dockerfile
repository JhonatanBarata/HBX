FROM node:20

ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    npm_config_update_notifier=false

# CLI docker ESTATICO (so-client, sem daemon) — usado pelo governor de motores para
# ligar/desligar hbx-engine-1..20 via socket montado (fallback "docker local" do
# hbx-engine-docker-adapter.service.ts quando não há OPS_CONTROL_TOKEN). Fica em camada
# própria antes do COPY do código, pra cachear independente de mudanças no app.
RUN curl -fsSL https://download.docker.com/linux/static/stable/x86_64/docker-27.5.1.tgz | tar -xz --strip-components=1 -C /usr/local/bin docker/docker \
 && docker --version

WORKDIR /app

COPY package*.json ./
RUN npm ci --no-audit --no-fund --loglevel=error

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["sh", "./scripts/start-prod.sh"]
