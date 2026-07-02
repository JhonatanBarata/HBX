# ARCSCRAPING — arquitetura de descoberta/enriquecimento de leads

> Resumo do que aprendemos (jul/2026). Dados reais, testados nesta máquina (CPU-only, 32GB).

## TL;DR
**Receita primeiro (identidade limpa) + Web depois (cara digital + informal sem CNPJ).**
Antes da IA, uma **lista vermelha** determinística mata o lixo. IA só toca no que pode ser ouro.

## As 2 fontes (complementares, não concorrentes)
| | Entrega | Falha |
|---|---|---|
| **Receita (CNPJ)** | CNPJ, razão, CNAE, sócio, situação (INAPTA=sinal). **~0% lixo** | sem site/insta/whatsapp; email quase sempre null; só quem tem CNPJ |
| **Web search (DuckDuckGo+Bing, R$0)** | site, Instagram, WhatsApp, telefone; acha o **informal/novo sem CNPJ** | **~90% lixo** (diretório/agregador/marketplace/blog) |

Web search entregou muito mais lixo (barbearia 9/10, mix 18/20). Receita 0/5.

## Funil
```
Receita (CNAE+município) ──► leads limpos (formalizados)
Web search ──► LISTA VERMELHA ──► IA (só o que sobra) ──► crawl do site ──► card
```

## Lista vermelha (filtro primário) — o método que faltava
- Bloqueia por **marca/domínio** (tripadvisor.*, doctoralia.*, solutudo.*…) e **forma de URL** (`/empresas/`, `/categoria/`, `/guia/`). Determinístico, 0ms, R$0.
- Regra atual (`filters.py`) **vaza**: pegou só 8/18; lista feita na mão e só-PT (deixou `tripadvisor.com/.pt` passar).
- **Tem que APRENDER:** IA/humano marca diretório → entra na lista → IA nunca mais vê.
- Erro do sistema é sempre **lixo passando** (falso positivo), nunca lead descartado → auditar os **APROVADOS** (a Receita/CNPJ downstream faz isso de graça), não os descartes.

## Crawl do site (etapa de enriquecimento)
Código próprio (`website-crawl-*`), `fetch` nativo + regex, **R$0**. Lê HTML/rodapé → CNPJ, telefone, WhatsApp, Insta, email, endereço + **sinais de venda** (site sem WhatsApp etc.).
- **Preço do grátis:** cego em site JS/SPA (não roda JavaScript). Upgrade = Playwright (caro em CPU) ou Firecrawl (caro em R$). Alvo pequeno costuma ter site simples → o grátis serve; medir antes de pagar.

## IA de filtro — benchmark (20 leads, CPU)
Velocidade no CPU = **parâmetros ATIVOS** (MoE > denso). Filtro **não precisa de modelo pesado**: 14b empata 30b.

| Modelo (ativos) | Acerto | Tempo/lead |
|---|---|---|
| granite 1B-ativo | 17/20 | **8,9s** (mais leve/rápido) |
| qwen3:4b | 18/20 | 14,1s |
| qwen3:8b | 19/20 | 15,2s |
| qwen2.5:7b (atual) | 20/20 | 16,6s |
| gpt-oss:20b | 20/20 | **57,8s** (só GPU) |

**Ninguém errou os 2 leads reais** — todos os erros foram em diretório (o que a lista vermelha apaga). Logo, com a lista vermelha na frente, a escolha da IA vira **velocidade/peso**.

## Decisões
- **Substituir o 30b → `gpt-oss-20b`** (extração pesada, **LOCAL, precisa GPU**). Feito.
- **VPS (classificar bot + cards):** modelo leve. Com lista vermelha = **granite 1B-ativo**; sem ela = 7b. (a decidir, testar)
- **Placa:** RTX 3060 12GB **NÃO** roda gpt-oss/30b (13–18GB). gpt-oss inteiro = 16GB; 30b = 24GB (3090).
- **Contenção no VPS:** capar CPU do Ollama (`OLLAMA_NUM_PARALLEL=1` + limitar núcleos) senão a inferência trava a navegação dos clientes — buscas na fila é OK, navegação lenta não.
