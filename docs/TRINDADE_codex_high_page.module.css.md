# HBX Inbox Premium — page.module.css

Arquivo-alvo: `frontend/src/app/dashboard/inbox/page.module.css`

Status: pronto para colar nos blocos abaixo.

> Objetivo: deixar o chat visualmente muito mais próximo do mock premium escuro, com mensagens ocupando quase toda a linha útil, menos espaço morto no centro, header/composer mais refinados e timeline mais densa.

## 1) Substituir o bloco `.whatsAppConversationHeader`

```css
.whatsAppConversationHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.9rem;
  padding: 0.86rem 1.18rem;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  background:
    linear-gradient(135deg, rgba(13, 27, 43, 0.96), rgba(17, 34, 54, 0.98)),
    radial-gradient(circle at top left, rgba(0, 201, 167, 0.08), transparent 32%);
  backdrop-filter: blur(22px) saturate(132%);
  -webkit-backdrop-filter: blur(22px) saturate(132%);
  box-shadow:
    0 1px 0 rgba(0,201,167,0.08),
    0 12px 30px rgba(0,0,0,0.24),
    inset 0 1px 0 rgba(255,255,255,0.035);
  flex-shrink: 0;
}
```

## 2) Substituir o bloco `.whatsAppTimeline`

```css
.whatsAppTimeline {
  min-height: 0;
  display: grid;
  gap: 0.42rem;
  align-content: start;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 1rem 0.95rem 1.1rem;
  scrollbar-width: thin;
  scrollbar-color: var(--ix-scrollbar-thumb) transparent;
  background:
    radial-gradient(ellipse at 12% 0%, rgba(0, 201, 167, 0.045) 0%, transparent 42%),
    radial-gradient(ellipse at 88% 100%, rgba(0, 90, 70, 0.065) 0%, transparent 44%),
    linear-gradient(180deg, #09131d 0%, #08121b 100%);
  background-attachment: local;
}
```

## 3) Substituir o bloco `.whatsAppComposerForm`

```css
.whatsAppComposerForm {
  position: relative;
  z-index: 2;
  display: grid;
  gap: 0.44rem;
  margin-top: auto;
  padding: 0.82rem 0.95rem 0.88rem;
  border-top: 1px solid rgba(255,255,255,0.06);
  background:
    linear-gradient(180deg, rgba(10, 22, 35, 0.92), rgba(11, 24, 38, 0.985)),
    radial-gradient(circle at bottom left, rgba(0, 201, 167, 0.05), transparent 34%);
  backdrop-filter: blur(24px) saturate(130%);
  -webkit-backdrop-filter: blur(24px) saturate(130%);
  box-shadow:
    0 -1px 0 rgba(0,201,167,0.06),
    0 -16px 34px rgba(0,0,0,0.30);
}
```

## 4) Substituir o bloco `.whatsAppComposerRow`

```css
.whatsAppComposerRow {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
}
```

## 5) Substituir o bloco `.whatsAppComposerInput`

```css
.whatsAppComposerInput {
  position: relative;
  z-index: 2;
  flex: 1 1 auto;
  width: 100%;
  min-height: 46px;
  max-height: 180px;
  resize: none;
  pointer-events: auto;
  user-select: text;
  -webkit-user-select: text;
  border: 1px solid rgba(255,255,255,0.09) !important;
  border-radius: 14px !important;
  background: linear-gradient(180deg, rgba(255,255,255,0.048), rgba(255,255,255,0.032)) !important;
  color: var(--ix-text) !important;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.05),
    0 6px 18px rgba(0,0,0,0.22) !important;
  padding: 0.72rem 0.95rem !important;
  font-size: 0.94rem;
  line-height: 1.5;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}
```

## 6) Substituir o bloco `.whatsAppComposerButton`

```css
.whatsAppComposerButton {
  position: relative;
  z-index: 2;
  flex: 0 0 auto;
  width: 46px;
  height: 46px;
  min-height: 46px;
  padding: 0;
  border: none !important;
  border-radius: 14px !important;
  background: linear-gradient(145deg, #00d2af, #00957b) !important;
  color: #ffffff !important;
  box-shadow:
    0 8px 24px rgba(0, 201, 167, 0.34),
    inset 0 1px 0 rgba(255,255,255,0.22) !important;
  font-weight: 800;
  font-size: 1.05rem;
  line-height: 1;
  transition: transform 0.12s ease, box-shadow 0.12s ease, opacity 0.1s;
}
```

## 7) Substituir o bloco `.whatsAppMessageBlock`

```css
.whatsAppMessageBlock {
  display: grid;
  gap: 0.32rem;
  width: 100%;
}
```

## 8) Substituir os blocos das rows

```css
.whatsAppMessageRow {
  display: flex;
  width: 100%;
}

.whatsAppMessageRowInbound {
  justify-content: flex-start;
}

.whatsAppMessageRowOutbound {
  justify-content: flex-end;
}

.whatsAppMessageRowSystem {
  justify-content: center;
}
```

## 9) Substituir o bloco `.whatsAppBubble`

```css
.whatsAppBubble {
  position: relative;
  display: block;
  width: fit-content;
  max-width: min(92%, 980px);
  min-width: 108px;
  padding: 0.48rem 0.66rem 0.38rem;
  border-radius: 16px;
  box-shadow:
    0 8px 24px rgba(0,0,0,0.22),
    0 1px 0 rgba(255,255,255,0.04);
}
```

## 10) Adicionar logo abaixo do bloco `.whatsAppBubble`

```css
.whatsAppMessageRowInbound .whatsAppBubble {
  margin-right: auto;
  max-width: min(92%, 980px);
}

.whatsAppMessageRowOutbound .whatsAppBubble {
  margin-left: auto;
  max-width: min(86%, 920px);
}
```

## 11) Substituir o bloco `.whatsAppBubbleInbound`

```css
.whatsAppBubbleInbound {
  background: linear-gradient(165deg, #1b3141, #172b3a);
  color: var(--ix-text);
  border-radius: 5px 16px 16px 16px;
  border: 1px solid rgba(255,255,255,0.072);
}
```

## 12) Substituir o bloco `.whatsAppBubbleOutbound`

```css
.whatsAppBubbleOutbound {
  background: linear-gradient(165deg, #0d4f40, #0b4337);
  color: #e6fbf5;
  border-radius: 16px 5px 16px 16px;
  border: 1px solid rgba(0, 201, 167, 0.16);
}
```

## 13) Substituir o bloco `.whatsAppBubbleText`

```css
.whatsAppBubbleText {
  margin: 0;
  padding-right: 3.45rem;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: break-word;
  hyphens: none;
  line-height: 1.48;
  font-size: 0.92rem;
  letter-spacing: 0.005em;
}
```

## 14) Substituir o bloco `.whatsAppBubbleMeta`

```css
.whatsAppBubbleMeta {
  position: absolute;
  right: 0.5rem;
  bottom: 0.32rem;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 0.66rem;
  line-height: 1;
  color: rgba(148, 186, 200, 0.72);
}
```

## 15) Ajuste fino opcional para mídia/documento/áudio

```css
.whatsAppBubbleWithAttachment {
  min-width: 260px;
}

.whatsAppDocumentCard,
.whatsAppAudioCard {
  width: min(420px, 100%);
}
```

## Resultado esperado

- mensagens da esquerda ocupando quase toda a linha útil
- mensagens da direita muito mais largas
- menos buraco no meio do chat
- header mais premium
- composer mais forte e mais vendido
- sensação muito mais próxima da imagem de referência
