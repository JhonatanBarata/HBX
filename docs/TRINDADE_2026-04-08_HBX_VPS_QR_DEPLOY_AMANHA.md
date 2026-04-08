# TRINDADE — 2026-04-08 — HBX — VPS QR Deploy Amanhã

## Sistema
HBX

## Objetivo
Registrar a decisão de sair do Oracle e preparar um deploy simples, barato e objetivo para finalmente expor o QR Code do motor WhatsApp para uso externo.

## Decisão principal
A rota escolhida para amanhã é:

1. **Pagar uma VPS barata** para o motor QR.
2. **Subir apenas o motor/problemático primeiro**.
3. **Parar de insistir em free tier instável** para esse caso.
4. **Priorizar previsibilidade operacional acima de economia burra**.

## Verdade operacional
Não existe garantia absoluta de QR funcionando antes do deploy real.
O que existe é **subir muito a probabilidade** ao trocar a rota errada por uma rota simples e compatível com o problema.

A leitura fechada é:
- Oracle foi rota ruim para esse cenário.
- VPS simples faz mais sentido.
- O alvo inicial não é escalar, é **gerar o QR e entregar isso ao HBX sem novela**.

---

# Trindade

## 1) MINI
**Nível de inteligência:** mini

### Missão
Executar o menor caminho possível para colocar o QR no ar amanhã.

### Escopo
- Comprar a VPS barata.
- Instalar Docker e Docker Compose.
- Subir apenas o serviço do motor QR.
- Expor uma URL pública estável.
- Validar:
  - serviço online
  - endpoint respondendo
  - QR sendo gerado
  - HBX conseguindo ler o status

### Regra central
**Nada de inventar arquitetura nova amanhã.**
O objetivo é colocar o QR no ar com o menor número possível de variáveis.

### Resultado esperado
Uma URL pública funcional onde o QR possa ser acessado e o status da sessão possa ser lido pelo HBX.

---

## 2) COPILOT
**Nível de inteligência:** high / xhigh

### Missão
Reduzir risco operacional e impedir repetição da perda de tempo vivida com Oracle/free tier.

### Direção
- Separar claramente o que roda no HBX e o que roda na VPS.
- A VPS hospeda o executor do QR.
- O HBX continua como cérebro e interface.
- O deploy de amanhã deve ser o menor recorte funcional possível.

### Guardrails
- Não misturar tudo no mesmo servidor sem necessidade.
- Não abrir frentes paralelas desnecessárias.
- Não depender de features frágeis de trial/free.
- Não tratar “teoricamente possível” como “boa decisão”.

### Resultado esperado
Um caminho operacional simples, repetível e menos sensível a surpresas de ambiente.

---

## 3) CODEX
**Nível de inteligência:** high / xhigh

### Missão
Executar o deploy técnico do motor QR em VPS barata e integrar a leitura do status/QR ao HBX.

### Escopo técnico inicial
- Provisionar VPS.
- Configurar acesso SSH.
- Instalar Docker.
- Subir o container do motor QR.
- Persistir sessão/local auth em disco da VPS.
- Publicar endpoint/porta necessária.
- Apontar o HBX para essa nova URL.
- Validar status, QR e reconexão.

### Checklist mínimo de sucesso
- `/health` ou equivalente responde.
- criação de sessão responde.
- leitura de status responde.
- QR é retornado.
- após scan, status vira conectado.
- HBX exibe a mudança de estado.

### Verdade técnica
Não existe garantia honesta sem executar.
Mas a chance de dar certo em VPS simples é **muito maior** do que insistir em Oracle/free tier para esse caso.

### Resultado esperado
QR funcional com muito menos atrito operacional.

---

# Regra fechada a partir desta decisão
Para infraestrutura crítica de QR/WhatsApp do HBX, a prioridade passa a ser:

**verdade operacional > economia ilusória**

Se uma rota tiver alta chance de dead end, ela deve ser tratada como ruim logo no início.

---

# Frase-resumo
**Amanhã o objetivo não é economizar mais alguns euros; é finalmente fazer o QR aparecer sem repetir a novela do Oracle.**
