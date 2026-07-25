# TESTES PÓS-IMPLANTAÇÃO — sequência pronta (executar na ordem)

Regras: prod é **read-only** para o executor. NUNCA ligar `agendaV2Ativa` em empresa real.
Navegador = Chrome. Local = `npm run up` → http://localhost:3001, credenciais em
`.test-login.local.md` (`teste`/`teste123`, acesso full).

## Bloco 0 — antes do publish (gate local, repete o das sprints)

```bash
cd backend && npm run build
```
```bash
cd frontend && npm run build
```
```bash
cd backend && npm run build && node --test dist/logistica/logistica-agenda-eta.test.js
```
- Abrir localhost:3001 → /logistica → aba Agenda: importar sequência, badge divergência,
  badge horário — os 3 visíveis e funcionando na empresa de teste. **Publicar sem abrir a
  tela = entregar quebrado (incidente 22/07).**

## Bloco 1 — publish (SÓ quando o dono mandar)

```bash
npm run publish
```
- Exit 0 NÃO basta (incidente 22/07: publish morria calado) — ler o log até o fim e conferir
  os blocos 2 e 3 SEMPRE.

## Bloco 2 — saúde de prod (build verde ≠ boot ok)

```bash
node scripts/vps-run.js "docker ps --format '{{.Names}} {{.Status}}'"
```
→ todos os containers `Up`, nenhum `Restarting`.

```bash
node scripts/vps-run.js "docker logs hbx-backend --since 5m 2>&1 | tail -60"
```
→ sem stack trace de DI/boot (NestJS quebra em runtime com build verde).

```bash
node scripts/vps-run.js "curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000"
```
→ `200` (porta 3000 é loopback-only no VPS — por isso o curl roda LÁ dentro).

```bash
node scripts/vps-run.js "docker exec hbx-backend npx prisma migrate status | tail -5"
```
→ nenhuma migration pendente (S1–S4 não criam migration; drift antigo do schema é conhecido,
não é regressão desta frente).

## Bloco 3 — endpoints novos no ar (sem login = porta fechada)

```bash
node scripts/vps-run.js "curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/logistica/agenda/dias/6/sequencias"
```
```bash
node scripts/vps-run.js "curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/logistica/agenda/dias/6/divergencias"
```
→ `401` nos dois. `404` = endpoint não subiu (dist velho); `500` = quebrou — reportar, não
remendar em prod.

## Bloco 4 — funcional em prod (SÓ empresa de smoke, com ok do dono)

Empresa 5 é a logística-only dos smokes. Com ok do dono, logar nela e repetir em 5 minutos:
1. Aba Agenda abre sem erro no console (F12).
2. "Importar sequência" lista as rotas salvas e o preview abre (NÃO aplicar em rota real sem
   o dono pedir).
3. Badge de divergência e de horário aparecem/não aparecem coerentes com os dados da empresa.
Sem ok do dono: parar no Bloco 3 e reportar.

## Bloco 5 — APK (nada mudou, só confirmar que nada mudou)

```bash
node scripts/vps-run.js "cat /var/www/hbx-downloads/version-logistica.json"
```
→ `versionCode` igual ao de antes do publish (**31**, fingerprint `7f8edd92…`). O JSON é
arquivo estático servido por nginx sob `/downloads/`, NÃO rota do backend — `curl` em
`localhost:3000/download/version-logistica.json` responde 404 e não prova nada.
A digital do APK cobre só `EntregaShell/app/src` + gradle; mudança fora dali mantém o
versionCode e nenhum celular baixa nada. Se o número subiu sem ninguém ter mexido no APK,
reportar antes de qualquer outra coisa.

## Bloco 6 — o dia em que o dono ligar a empresa 41 (checklist de acompanhamento)

1. Prévia do "Organizar agora" ANTES de aplicar (a tela já mostra).
2. Importar a sequência do sábado do André (rota salva de 95) → conferir preview: casados +
   fora-da-sequência + sem-plano fazem sentido antes de aplicar.
3. Abrir a conferência de terça → a 17ª parada (SO_NA_ROTA) tem que aparecer com nome.
4. Mapa: **113 clientes SEM pino é o esperado** (pendência honesta pós-backfill do geocode,
   não é bug) — se auto-corrige a cada entrega confirmada com GPS ≤60 m.
5. Rollbacks à mão, do mais leve pro mais pesado:
   - desligar `agendaV2Ativa` da empresa (volta tudo pro motor antigo);
   - `git revert` do commit da sprint problemática;
   - pinos: `node scripts/vps-run.js "docker exec -w /app/storage hbx-backend node /app/scripts/backfill-pinos-suspeitos.js --rollback=/app/storage/backfill-pinos-20260725191612.json"`;
   - agenda inteira: `git revert f4dd9b08 45818123` + backup físico em
     `C:\Users\Jhonatan\Desktop\backup-agenda-semanal-20260725\`.
