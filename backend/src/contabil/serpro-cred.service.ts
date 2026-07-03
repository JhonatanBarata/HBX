import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { vaultEncrypt, vaultDecrypt } from './contabil-vault.util';
import type { SerproCredential } from './serpro-integra.client';

// ===========================================================================
// CONTABIL S7 — Cofre da credencial Serpro (consumer key/secret Integra Contador).
// ---------------------------------------------------------------------------
// Espelha EXATAMENTE o NfseCertService (S6): envelope JSON com cada parte
// criptografada SEPARADAMENTE (AES-256-GCM, cofre `HBX_CONTABIL_VAULT_KEY`),
// guardado em FiscalProfile.serproCredEncrypted (o campo já existe no schema, S7).
// O segredo NUNCA sai pela API: serializePerfil (contabil.service) só devolve o
// flag `serproConfigured`; o material decriptado só existe em memória no uso.
//
// CNPJs (contratante/contribuinte) NÃO são segredo (dado público) — mas viajam
// no MESMO envelope por conveniência (uma leitura só resolve a credencial inteira).
// Provavelmente NÃO precisa de migration nova: reusa serproCredEncrypted.
// ===========================================================================

const FISCAL_PROFILE_ID = 1;

export interface SerproCredInput {
  consumerKey: string;
  consumerSecret: string;
  contratanteCnpj: string;
  contribuinteCnpj?: string; // default = contratante (caso 1-sócio: autoriza a si)
}

@Injectable()
export class SerproCredService {
  private readonly logger = new Logger(SerproCredService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Guarda a credencial Serpro no cofre (envelope criptografado). Valida o mínimo
   * (key/secret não vazios, CNPJ com 14 dígitos). NUNCA loga/retorna o segredo —
   * devolve só o flag de presença.
   */
  async salvarCredencial(input: SerproCredInput) {
    const consumerKey = String(input?.consumerKey ?? '').trim();
    const consumerSecret = String(input?.consumerSecret ?? '').trim();
    const contratanteCnpj = String(input?.contratanteCnpj ?? '').replace(/\D/g, '');
    const contribuinteCnpj = String(input?.contribuinteCnpj ?? '').replace(/\D/g, '') || contratanteCnpj;

    if (!consumerKey || !consumerSecret) throw new BadRequestException('Informe a consumer key e o secret do Serpro.');
    if (contratanteCnpj.length !== 14) throw new BadRequestException('CNPJ do contratante inválido (14 dígitos).');
    if (contribuinteCnpj.length !== 14) throw new BadRequestException('CNPJ do contribuinte inválido (14 dígitos).');

    const envelope = JSON.stringify({
      v: 1,
      consumerKey: vaultEncrypt(consumerKey),
      consumerSecret: vaultEncrypt(consumerSecret),
      contratanteCnpj, // público — não criptografado
      contribuinteCnpj,
    });

    await (this.prisma as any).fiscalProfile.upsert({
      where: { id: FISCAL_PROFILE_ID },
      create: { id: FISCAL_PROFILE_ID, serproCredEncrypted: envelope },
      update: { serproCredEncrypted: envelope },
    });

    return { configurado: true };
  }

  /** Remove a credencial do cofre (dono trocou/revogou). */
  async removerCredencial() {
    await (this.prisma as any).fiscalProfile.update({
      where: { id: FISCAL_PROFILE_ID },
      data: { serproCredEncrypted: null },
    });
    return { configurado: false };
  }

  /** Flag público (nunca o segredo) — p/ o card do cofre e o gate do wizard. */
  async getStatus() {
    const perfil = await (this.prisma as any).fiscalProfile.findUnique({ where: { id: FISCAL_PROFILE_ID } });
    return { configurado: Boolean(perfil?.serproCredEncrypted) };
  }

  /**
   * Devolve a credencial DECRIPTADA (em memória) p/ o cliente Serpro autenticar.
   * Lança se não há credencial configurada. O chamador NUNCA deve logar/persistir
   * o retorno — usa e descarta.
   */
  async getCredencial(): Promise<SerproCredential> {
    const perfil = await (this.prisma as any).fiscalProfile.findUnique({ where: { id: FISCAL_PROFILE_ID } });
    if (!perfil?.serproCredEncrypted) {
      throw new NotFoundException('Credencial Serpro não configurada no cofre do Contabil.');
    }
    let env: any;
    try {
      env = JSON.parse(String(perfil.serproCredEncrypted));
    } catch {
      throw new BadRequestException('Envelope da credencial Serpro corrompido no cofre.');
    }
    const consumerKey = vaultDecrypt(env?.consumerKey);
    const consumerSecret = vaultDecrypt(env?.consumerSecret);
    if (!consumerKey || !consumerSecret) throw new BadRequestException('Material da credencial Serpro ausente no cofre.');
    const contratanteCnpj = String(env?.contratanteCnpj || '').replace(/\D/g, '');
    const contribuinteCnpj = String(env?.contribuinteCnpj || contratanteCnpj).replace(/\D/g, '');
    return { consumerKey, consumerSecret, contratanteCnpj, contribuinteCnpj };
  }
}
