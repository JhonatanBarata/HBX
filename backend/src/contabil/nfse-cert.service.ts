import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { X509Certificate } from 'crypto';
import { execFile } from 'child_process';
import { mkdtemp, rm, writeFile, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { vaultEncrypt, vaultDecrypt } from './contabil-vault.util';

// ===========================================================================
// CONTABIL S6 — Cofre de certificado A1 (o e-CNPJ do dono).
// ---------------------------------------------------------------------------
// Fluxo: dono sobe o .pfx + senha pela UI (drawer do perfil fiscal) →
//   1) extraímos cert PEM + chave privada PEM do PKCS#12 (via OpenSSL, sem novo
//      npm dep — OpenSSL é padrão nos containers/host);
//   2) lemos a validade do cert (X509Certificate.validTo) → certA1ExpiresAt;
//   3) criptografamos cert PEM, chave PEM e senha (AES-256-GCM, cofre) e
//      guardamos como um ENVELOPE JSON em FiscalProfile.certA1Encrypted.
// O .pfx cru NÃO é guardado — só os PEM extraídos (menos I/O de subprocess no
// uso; a extração acontece 1x no upload). Segredo NUNCA em log/response: o
// serializePerfil (contabil.service) só devolve flags/validade, nunca o envelope.
//
// TESTE: o método interno de assinatura recebe {certPem, keyPem} já em memória,
// então os testes injetam um cert de teste auto-assinado PEM SEM depender de
// OpenSSL nem de PKCS#12 (ver nfse-national.client.test.ts).
// ===========================================================================

const FISCAL_PROFILE_ID = 1;
const MAX_PFX_BYTES = 512 * 1024; // certificado A1 é pequeno (<< 100KB); teto de sanidade.
/** Antecedência da obrigação sintética "renovar certificado" (dias antes de expirar). */
export const CERT_RENOVACAO_ANTECEDENCIA_DIAS = 30;

export interface CertMaterial {
  certPem: string;
  keyPem: string;
  expiresAt: Date;
  subject: string;
}

/** O que fica DECRIPTADO em memória no momento do uso (assinatura da DPS). */
export interface CertSigningMaterial {
  certPem: string;
  keyPem: string;
}

@Injectable()
export class NfseCertService {
  private readonly logger = new Logger(NfseCertService.name);

  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // UPLOAD — .pfx + senha → PEM extraídos → cofre.
  // -------------------------------------------------------------------------

  /**
   * Recebe o buffer do .pfx (multer memoryStorage) + a senha, extrai o material
   * do certificado, valida (não expirado), criptografa e grava no FiscalProfile.
   * Também (re)gera a obrigação sintética de renovação. NUNCA loga/retorna o
   * segredo — devolve só metadados públicos (validade/subject/flag).
   */
  async uploadCertificado(pfxBuffer: Buffer, senha: string) {
    if (!pfxBuffer?.length) throw new BadRequestException('Envie o arquivo .pfx do certificado.');
    if (pfxBuffer.length > MAX_PFX_BYTES) throw new BadRequestException('Arquivo de certificado grande demais (máx 512KB).');
    const pass = String(senha ?? '');
    if (!pass) throw new BadRequestException('Informe a senha do certificado.');

    let material: CertMaterial;
    try {
      material = await this.extrairMaterialDoPfx(pfxBuffer, pass);
    } catch (err) {
      // Mensagem GENÉRICA — nunca ecoa a senha nem stderr do openssl (pode conter caminho/segredo).
      this.logger.warn(`[contabil] extração do certificado falhou: ${String((err as Error)?.message || err).slice(0, 120)}`);
      throw new BadRequestException('Não foi possível abrir o certificado. Confira o arquivo .pfx e a senha.');
    }

    if (material.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(`Certificado já expirou (validade ${material.expiresAt.toISOString().slice(0, 10)}).`);
    }

    // Envelope JSON com as 3 partes criptografadas SEPARADAMENTE.
    const envelope = JSON.stringify({
      v: 1,
      certPem: vaultEncrypt(material.certPem),
      keyPem: vaultEncrypt(material.keyPem),
      senha: vaultEncrypt(pass),
    });

    await (this.prisma as any).fiscalProfile.upsert({
      where: { id: FISCAL_PROFILE_ID },
      create: { id: FISCAL_PROFILE_ID, certA1Encrypted: envelope, certA1ExpiresAt: material.expiresAt },
      update: { certA1Encrypted: envelope, certA1ExpiresAt: material.expiresAt },
    });

    await this.sincronizarObrigacaoRenovacao(material.expiresAt);

    return {
      configurado: true,
      certA1ExpiresAt: material.expiresAt.toISOString(),
      subject: material.subject,
    };
  }

  /** Remove o certificado do cofre (dono trocou/revogou). Zera a obrigação de renovação. */
  async removerCertificado() {
    await (this.prisma as any).fiscalProfile.update({
      where: { id: FISCAL_PROFILE_ID },
      data: { certA1Encrypted: null, certA1ExpiresAt: null },
    });
    try {
      await (this.prisma as any).fiscalObligation.deleteMany({ where: { tipo: 'CERT_RENOVACAO', estado: { not: 'CONFERIDO' } } });
    } catch { /* best-effort */ }
    return { configurado: false };
  }

  // -------------------------------------------------------------------------
  // USO — material decriptado só em memória (assinatura da DPS).
  // -------------------------------------------------------------------------

  /**
   * Devolve o cert PEM + chave PEM DECRIPTADOS (em memória) p/ o cliente NFS-e
   * assinar a DPS. Lança se não há certificado configurado. O chamador NUNCA
   * deve logar/persistir o retorno — usa e descarta.
   */
  async getSigningMaterial(): Promise<CertSigningMaterial> {
    const perfil = await (this.prisma as any).fiscalProfile.findUnique({ where: { id: FISCAL_PROFILE_ID } });
    if (!perfil?.certA1Encrypted) {
      throw new NotFoundException('Certificado A1 não configurado no cofre do Contabil.');
    }
    let env: any;
    try {
      env = JSON.parse(String(perfil.certA1Encrypted));
    } catch {
      throw new BadRequestException('Envelope do certificado corrompido no cofre.');
    }
    const certPem = vaultDecrypt(env?.certPem);
    const keyPem = vaultDecrypt(env?.keyPem);
    if (!certPem || !keyPem) throw new BadRequestException('Material do certificado ausente no cofre.');
    return { certPem, keyPem };
  }

  /** Metadados públicos do certificado (nunca o segredo) — p/ o card do cofre. */
  async getStatus() {
    const perfil = await (this.prisma as any).fiscalProfile.findUnique({ where: { id: FISCAL_PROFILE_ID } });
    const configurado = Boolean(perfil?.certA1Encrypted);
    const expiresAt: Date | null = perfil?.certA1ExpiresAt ? new Date(perfil.certA1ExpiresAt) : null;
    const diasParaExpirar = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;
    return {
      configurado,
      certA1ExpiresAt: expiresAt ? expiresAt.toISOString() : null,
      diasParaExpirar,
      expirado: diasParaExpirar != null && diasParaExpirar < 0,
      renovarEmBreve: diasParaExpirar != null && diasParaExpirar >= 0 && diasParaExpirar <= CERT_RENOVACAO_ANTECEDENCIA_DIAS,
    };
  }

  // -------------------------------------------------------------------------
  // OBRIGAÇÃO SINTÉTICA "renovar certificado" (pluga no alertador do S2).
  // -------------------------------------------------------------------------

  /**
   * Cria/atualiza a obrigação `CERT_RENOVACAO` com dueDate = 30 dias antes de
   * expirar. O obligation-scheduler do S2 já alerta D-7/D-3/D-1/D0/ATRASADO sobre
   * QUALQUER obrigação aberta — então basta existir esta linha p/ o dono ser
   * avisado. Idempotente: 1 linha por (competencia='CERT', tipo='CERT_RENOVACAO').
   */
  async sincronizarObrigacaoRenovacao(expiresAt: Date): Promise<void> {
    const dueDate = new Date(expiresAt.getTime() - CERT_RENOVACAO_ANTECEDENCIA_DIAS * 24 * 60 * 60 * 1000);
    try {
      const existente = await (this.prisma as any).fiscalObligation.findUnique({
        where: { competencia_tipo: { competencia: 'CERT', tipo: 'CERT_RENOVACAO' } },
      });
      if (existente) {
        // Não ressuscita se o dono já conferiu; só reabre/atualiza dueDate se ainda relevante.
        if (existente.estado === 'CONFERIDO' && dueDate.getTime() > Date.now()) {
          await (this.prisma as any).fiscalObligation.update({
            where: { id: existente.id },
            data: { dueDate, estado: 'AGUARDANDO_DADOS', alertasEnviados: '[]' },
          });
        } else {
          await (this.prisma as any).fiscalObligation.update({ where: { id: existente.id }, data: { dueDate } });
        }
        return;
      }
      await (this.prisma as any).fiscalObligation.create({
        data: { competencia: 'CERT', tipo: 'CERT_RENOVACAO', dueDate, naoAplicavel: false, estado: 'AGUARDANDO_DADOS' },
      });
    } catch (err) {
      this.logger.warn(`[contabil] falha ao sincronizar obrigação de renovação do cert: ${String((err as Error)?.message || err)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Extração do PKCS#12 via OpenSSL (sem novo npm dep).
  // -------------------------------------------------------------------------

  /**
   * Extrai cert PEM + chave privada PEM de um buffer PKCS#12 usando OpenSSL.
   * OpenSSL 3 exige `-legacy` p/ .pfx antigos (RC2/3DES) — tentamos moderno e,
   * se falhar, com `-legacy`. A senha vai por STDIN (`pass:stdin`) — NUNCA na
   * linha de comando (visível em `ps`). Arquivos temporários apagados no finally.
   */
  private async extrairMaterialDoPfx(pfxBuffer: Buffer, senha: string): Promise<CertMaterial> {
    const dir = await mkdtemp(join(tmpdir(), 'hbx-cert-'));
    const pfxPath = join(dir, 'in.pfx');
    try {
      await writeFile(pfxPath, pfxBuffer);
      let bundlePem: string;
      try {
        bundlePem = await this.opensslPkcs12ToPem(pfxPath, senha, false);
      } catch {
        bundlePem = await this.opensslPkcs12ToPem(pfxPath, senha, true);
      }
      const certPem = this.extrairBloco(bundlePem, 'CERTIFICATE');
      const keyPem = this.extrairChavePrivada(bundlePem);
      if (!certPem || !keyPem) throw new Error('cert/key não encontrados no PKCS#12');

      const x509 = new X509Certificate(certPem);
      const expiresAt = new Date(x509.validTo);
      if (Number.isNaN(expiresAt.getTime())) throw new Error('validade do certificado ilegível');
      return { certPem, keyPem, expiresAt, subject: x509.subject };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => { /* noop */ });
    }
  }

  /** Roda `openssl pkcs12 -in <pfx> -nodes` com a senha por STDIN. Devolve o PEM (cert+key). */
  private opensslPkcs12ToPem(pfxPath: string, senha: string, legacy: boolean): Promise<string> {
    const openssl = process.env.HBX_OPENSSL_BIN || 'openssl';
    const args = ['pkcs12', '-in', pfxPath, '-nodes', '-passin', 'stdin'];
    if (legacy) args.push('-legacy');
    return new Promise<string>((resolve, reject) => {
      const child = execFile(openssl, args, { maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) return reject(new Error(`openssl pkcs12 falhou${stderr ? `: ${String(stderr).slice(0, 80)}` : ''}`));
        resolve(String(stdout));
      });
      // Senha por STDIN (não aparece em `ps`); \n encerra a leitura do passin.
      child.stdin?.end(`${senha}\n`);
    });
  }

  private extrairBloco(pem: string, tipo: 'CERTIFICATE'): string | null {
    const re = new RegExp(`-----BEGIN ${tipo}-----[\\s\\S]*?-----END ${tipo}-----`);
    const m = re.exec(pem);
    return m ? m[0] + '\n' : null;
  }

  /** Aceita tanto PKCS#8 ("PRIVATE KEY") quanto PKCS#1/EC ("RSA/EC PRIVATE KEY"). */
  private extrairChavePrivada(pem: string): string | null {
    const re = /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC )?PRIVATE KEY-----/;
    const m = re.exec(pem);
    return m ? m[0] + '\n' : null;
  }
}
