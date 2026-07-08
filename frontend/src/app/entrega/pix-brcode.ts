"use client";

// ================================================================
// LOGÍSTICA F1 (07/07) — BR Code Pix ESTÁTICO gerado 100% no aparelho.
//
// O payload EMV®-QRCPS do Pix é padrão ABERTO (manual do BCB): chave do
// RECEBEDOR (o tenant) + valor + nome/cidade + CRC16. Nada disso passa por
// API, gateway ou backend — o dinheiro cai DIRETO na conta do vendedor,
// taxa ZERO. A conciliação é manual (ele vê cair no banco), exatamente como
// esse mercado já opera. MercadoPago NÃO entra aqui (decisão do dono 07/07:
// "nada de cartão por aqui"; Pix direto > taxa).
//
// Campos do payload (estático, com valor):
//   00 formato "01" · 26 conta (GUI br.gov.bcb.pix + chave) · 52 MCC "0000"
//   53 moeda "986" · 54 valor "12.50" · 58 "BR" · 59 nome (≤25)
//   60 cidade (≤15) · 62-05 txid "***" · 63 CRC16-CCITT/FALSE.
// ================================================================

export interface PixBrCodeInput {
  /** Chave Pix do recebedor (email, +55…, CPF/CNPJ só dígitos ou EVP). */
  chave: string;
  /** Valor em R$. null/0 → QR sem valor (o pagador digita). */
  valor?: number | null;
  /** Nome do recebedor (payload exige; max 25, sem acento). */
  nome?: string | null;
  /** Cidade do recebedor (payload exige; max 15, sem acento). */
  cidade?: string | null;
  /** Identificador da transação (estático usa "***"). */
  txid?: string | null;
}

/** Monta o payload BR Code completo (o texto do QR E do copia-e-cola). */
export function pixBrCode(input: PixBrCodeInput): string {
  const chave = String(input.chave || "").trim();
  if (!chave) return "";

  const nome = campoEmv(input.nome, 25) || "RECEBEDOR";
  const cidade = campoEmv(input.cidade, 15) || "BRASIL";
  const txid = campoEmv(input.txid, 25) || "***";

  const valorNum = Number(input.valor);
  const valorStr =
    Number.isFinite(valorNum) && valorNum > 0 ? Math.min(valorNum, 9_999_999).toFixed(2) : "";

  const conta = emv("26", emv("00", "br.gov.bcb.pix") + emv("01", chave.slice(0, 77)));
  const semCrc =
    emv("00", "01") +
    conta +
    emv("52", "0000") +
    emv("53", "986") +
    (valorStr ? emv("54", valorStr) : "") +
    emv("58", "BR") +
    emv("59", nome) +
    emv("60", cidade) +
    emv("62", emv("05", txid)) +
    "6304";
  return semCrc + crc16(semCrc);
}

// ── TLV: ID(2) + LEN(2) + VALUE ──────────────────────────────────────────────
function emv(id: string, value: string): string {
  const v = String(value ?? "");
  if (!v) return "";
  return id + String(Math.min(v.length, 99)).padStart(2, "0") + v.slice(0, 99);
}

// Nome/cidade/txid: sem diacrítico e só ASCII imprimível (o que os bancos leem
// sem engasgar). Colapsa espaços e corta no teto do campo.
function campoEmv(s: string | null | undefined, max: number): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^ -~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// CRC16-CCITT/FALSE (poly 0x1021, init 0xFFFF) — exatamente o do manual do BCB;
// cobre o payload inteiro INCLUINDO o "6304" final, em hex maiúsculo.
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
