# CONTABIL — o contador-robô do dono, dentro do /master

**Pedido do dono (02/07/2026):** app de altíssima qualidade no master, nomeado **Contabil**: alertas
fiscais, faturamento do HBX puxado automático (já está no banco), e — quando possível — **ele mesmo
posta as coisas** (só pede as informações). Baseado em outros sistemas do mercado.

**Contexto de negócio:** dono vai abrir SLU no Simples Nacional e rodar SEM contador mensal
(estratégia das 2 fases + Fator R — ver `Manual-Dono-Contador-HBX.docx` e `Guia-CNPJ-Dono-HBX.docx`
no Desktop do dono; a matemática fiscal de referência está NELES, com valores 2026 conferidos).
O Contabil é o que transforma o manual em software: o app vigia, calcula, prepara e (com aprovação)
transmite.

## Benchmark — em que nos baseamos
| Sistema | O que copiamos |
|---|---|
| Contabilizei | Dashboard "imposto do mês + prazo + status", eles transmitem por você |
| Conta Azul / Nibo | Financeiro conciliado + agenda tributária viva |
| Qipu | Alertas de obrigação como produto principal (simplicidade) |
| Jettax / Domínio / e-Simples | Robôs fiscais via **Serpro Integra Contador** (o caminho oficial de autopost) |

**Síntese HBX:** "Conta Azul do dono" (números vivos do próprio banco MP) + "robô-contador"
(APIs oficiais) + "copiloto que pensa junto" (recomendações determinísticas, não-IA).

## As portas oficiais de autopost (confirmadas 02/07/2026)
1. **Serpro Integra Contador** — API paga por chamada (~R$ 0,40 declarar PGDAS-D + R$ 0,32 gerar
   DAS; ~R$ 0,96 o ciclo completo no tier 1). Contratação na Loja Serpro com e-CNPJ.
   Docs: https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/
2. **API NFS-e Nacional (Sefin)** — REST oficial, produção liberada out/2025. Emissão de DPS
   (XML assinado, mTLS com certificado ICP-Brasil A1). Swagger:
   https://www.nfse.gov.br/swagger/contribuintesissqn/ · Docs:
   https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica
3. **eSocial/DCTFWeb** — automação plena é desproporcional p/ 1 sócio (SOAP, eventos assinados).
   Fica **semi-auto**: o app monta os valores prontos + deep-links; dono digita em 3 min.

## Leis do Contabil (invioláveis — dinheiro e fisco não têm git revert)
1. **Copiloto, não piloto:** o app calcula TUDO e prepara o payload, mas **só transmite com clique
   explícito de aprovação do dono** (fluxo ARMAR → TRANSMITIR). Automação sem clique só será
   discutida após ≥3 meses sem divergência. NUNCA transmitir em background.
2. **Motor fiscal 100% determinístico e testado:** tabelas (Anexo III/V, INSS, IRRF 2026) vivem em
   constantes **versionadas por vigência** (`vigenciaInicio/Fim`) com golden tests. IA NÃO calcula
   imposto — no máximo redige texto explicativo.
3. **Segredos fora do repo:** certificado A1 e credenciais Serpro criptografados (AES-256-GCM,
   chave em env da VPS), upload só pela UI, nunca em git/log/seed.
4. **Trilha de auditoria total:** toda chamada externa (Serpro/NFS-e) gera `FiscalAutomationLog`
   com payload, resposta e quem aprovou.
5. **Frente financeira/fiscal = revisão obrigatória de diff** (regra da casa) + flags default OFF
   + sandbox/produção-restrita antes de produção.

## Ordem e gates
```
== ONDA ATUAL (executar agora) ==
S1 Motor fiscal + fonte de receita   (sem UI, sem gate)          → Opus
S2 Calendário + alertas              (usa MasterAlertService)    → Sonnet
S3 Janela Contabil no /master        (UI "altíssima qualidade")  → Sonnet
S4 Livro Caixa + lucro isento                                    → Sonnet
S5 Copiloto "Fechar o mês"           (semi-auto, ZERO API paga)  → Opus

== ONDA 2 (dono 03/07 "termine todos até o s7 go") — CÓDIGO atrás de flag OFF ==
S6 NFS-e Nacional automática         → Opus  (flag OFF; ativação LIVE atrás do gate cert A1 + CNPJ real)
S7 Autopost PGDAS-D/DAS via Serpro   → Opus  (flag OFF; ativação LIVE atrás do gate Loja Serpro)
```
**S1→S5 = produto COMPLETO em modo semi-auto (zero custo externo, zero risco de fisco).** S6/S7 são
o braço robótico ("ele mesmo posta" 100% automático via API oficial): CÓDIGO construído e testado com
cert de teste/mocks, tudo atrás de flag própria **default OFF** (deploy com flag OFF é inerte por design).
A validação LIVE (produção-restrita NFS-e, ambiente demo Serpro, emitir/declarar de verdade) NÃO roda
agora — depende de e-CNPJ A1 comprado + contrato Serpro + CNPJ real (o gate do dono). "Pronto" p/ S6/S7
= código completo + testes verdes + pronto pra ligar quando o dono tiver as chaves.

**Nota de dependência:** os alertas usam `backend/src/master-alert/master-alert.service.ts`
(JÁ existe no tree principal — e-mail + zap + log best-effort). Se o Cockpit Master nº8
(MasterEvent, em worktree não publicado) aterrissar, migrar os disparos pra trilha MasterEvent
é um refactor pontual — anotado no S2, não bloqueia nada.

**Execução:** 1 subagente por sprint (.md), na ordem. Sprint só começa com o anterior verde
(tsc + testes + aceite). Apagar o .md do sprint ao concluir (padrão da casa).
