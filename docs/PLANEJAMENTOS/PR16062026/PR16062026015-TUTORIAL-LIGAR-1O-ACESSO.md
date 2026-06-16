# PR16062026015 — TUTORIAL: ligar o coach no 1º acesso + textos

> Migrado de `PR14062026/tutorial-interativo.md`. O motor do tutorial (coach interativo
> clique-a-clique) está PRONTO; falta a decisão de ligá-lo no portão + assets/textos do dono.

## ✅ JÁ FEITO (F1–F5 — registro)
- Splash boot (`boot-splash.tsx`).
- Coach (`components/hbx/tutorial-coach*.tsx` + `lib/tutorial-coach-steps.ts`): holofote no alvo
  real, route-aware, persiste entre rotas (montado em `app-shell`), ramifica por cargo/plano,
  typewriter no Dashboard/Relatórios, passo final → `POST /support/contact-admin` (WhatsApp da
  empresa + e-mail + ticket, sem wa.me externo). Lint + catraca 560/560 + build verdes.
- Âncoras `data-tut` no `shell.tsx`; CSS `.tut-*` central em `screens.css`.

## ⛔ FALTA (decisão / assets do dono)
1. **Conectar no PRIMEIRO ACESSO** — `boas-vindas-gate.tsx` ainda usa o leitor estático
   (`tutorial-chapters`). Trocar pelo coach (gate chama `startTutorialCoach()`) é **decisão de
   UX — não rewirar sem ordem**. Hoje o tour roda na `/tutorial` e no menu da conta → Tutorial.
2. **Imagem do Meta** — dono sobe em `frontend/public` (passo "ativar pelo Meta").
3. **Número / por onde manda** o "ficou dúvida" — já cai em `/support/contact-admin`
   (`ADMIN_SUPPORT_PHONE`). Pra ir pro chip HBX 19 92012-1720, **setar a env**.
4. **Textos** dos resumos/passos — dono revisa e aprova.

## Status
Motor pronto; ligar no gate = ordem do dono; resto = ele sobe imagem / aprova texto / seta env.
