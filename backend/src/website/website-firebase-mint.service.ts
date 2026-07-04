import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';

// Mint central do Firebase Custom Token (Sprint 3 / T3, 02/07).
//
// DECISAO DE ARQUITETURA (ver relatorio da Sprint 3 para o detalhe completo):
// REST puro (IAM Credentials API `signJwt`) em vez de adicionar `firebase-admin`
// como dependencia nova. `google-auth-library` JA e dependencia do backend
// (usada em auth.service.ts e gmail-oauth.service.ts) e ja sabe descobrir
// Application Default Credentials (service account central do HBX) e trocar
// por access token OAuth2 — e o unico pedaco que faltava pra assinar o custom
// token do Firebase sem SDK novo. `firebase-admin` traria um SDK inteiro (Auth,
// Firestore, Storage, Messaging...) só pra usar 1% dele (createCustomToken),
// e esse 1% e, por baixo dos panos, exatamente a mesma chamada IAM signJwt que
// fazemos aqui direto. Menos peso, menos superficie de dependencia transitiva.
//
// FLUXO (quando WEBSITE_TOKEN_MINT_ENABLED=true):
// 1. GoogleAuth (ADC da SA CENTRAL do HBX) pega um access token OAuth2.
// 2. Access token central chama IAM Credentials
//    `projects/-/serviceAccounts/<SA-DO-PROJETO-DO-CLIENTE>:signJwt`
//    (impersonation — a SA central precisa da role `roles/iam.serviceAccountTokenCreator`
//    NA SA do projeto do cliente; nunca guardamos chave JSON por cliente).
// 3. O JWT assinado (payload no formato exigido pelo Firebase Auth REST:
//    iss=sub=SA do cliente, aud=identitytoolkit, uid=usuario HBX) VIRA o custom
//    token — o client SDK do site (`firebase.auth().signInWithCustomToken`) troca
//    ele por sessao Firebase Auth normalmente, sem nunca saber que veio de fora.
//
// NENHUMA chamada de rede acontece neste arquivo enquanto
// WEBSITE_TOKEN_MINT_ENABLED != 'true' — ver isEnabled()/assertEnabled().

const IAM_SIGN_JWT_TIMEOUT_MS = 8000;
const CUSTOM_TOKEN_TTL_SECONDS = 60 * 60; // 1h — mesma janela default do Firebase Admin SDK.

function envOn(name: string) {
  return ['true', '1', 'yes', 'on'].includes(String(process.env[name] || '').trim().toLowerCase());
}

function envStr(name: string, fallback = '') {
  return String(process.env[name] || '').trim() || fallback;
}

export type MintCustomTokenInput = {
  firebaseProjectId: string;
  uid: string;
  claims?: Record<string, unknown>;
};

@Injectable()
export class WebsiteFirebaseMintService {
  private readonly logger = new Logger(WebsiteFirebaseMintService.name);

  isEnabled(): boolean {
    return envOn('WEBSITE_TOKEN_MINT_ENABLED');
  }

  private mintSaEmail(): string {
    return envStr('WEBSITE_MINT_SA_EMAIL');
  }

  /**
   * SA de destino (impersonada) para o projeto do cliente. Padrao previsivel
   * (`hbx-website-mint@<projectId>.iam.gserviceaccount.com`) sobrescrevivel por
   * env pra clientes com SA de nome diferente. Nunca chamado com o mint desligado.
   */
  private targetServiceAccountEmail(firebaseProjectId: string): string {
    const override = envStr(`WEBSITE_MINT_TARGET_SA_${firebaseProjectId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`);
    if (override) return override;
    return envStr('WEBSITE_MINT_TARGET_SA_PATTERN', 'hbx-website-mint@{projectId}.iam.gserviceaccount.com').replace(
      '{projectId}',
      firebaseProjectId,
    );
  }

  private assertEnabled() {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException(
        'Mint central de Firebase Custom Token esta desligado (WEBSITE_TOKEN_MINT_ENABLED != true). ' +
          'Sites configurados com mint.useCentralMint devem cair no fallback da Function antiga ' +
          '(hbx-auth-flow.js) ate o dono ligar esta flag apos configurar a impersonation IAM (ver ' +
          'docs/PLANEJAMENTOS/WEBSITE-KIT/WEBSITE-KIT-SPRINT3.md, PENDENTE-DONO).',
      );
    }
    if (!this.mintSaEmail()) {
      throw new ServiceUnavailableException(
        'WEBSITE_TOKEN_MINT_ENABLED=true mas WEBSITE_MINT_SA_EMAIL nao esta configurado. ' +
          'Defina o email da service account CENTRAL do HBX (a que recebe serviceAccountTokenCreator ' +
          'nos projetos de cliente) antes de habilitar o mint.',
      );
    }
  }

  /**
   * Minta um Firebase Custom Token para `uid` no projeto `firebaseProjectId`,
   * via impersonation IAM. So chama rede quando isEnabled() === true — chamador
   * (WebsiteService) deve tratar ServiceUnavailableException como "cai pro
   * fallback da Function antiga", nunca como erro fatal pro usuario final.
   */
  async mintCustomToken(input: MintCustomTokenInput): Promise<{ customToken: string; expiresInSeconds: number }> {
    this.assertEnabled();

    const firebaseProjectId = String(input.firebaseProjectId || '').trim();
    const uid = String(input.uid || '').trim();
    if (!firebaseProjectId) throw new Error('firebaseProjectId e obrigatorio para mintar o custom token.');
    if (!uid) throw new Error('uid e obrigatorio para mintar o custom token.');

    const targetServiceAccount = this.targetServiceAccountEmail(firebaseProjectId);

    // Lazy import: mesmo padrao de gmail-oauth.service.ts / auth.service.ts —
    // so toca a lib quando o fluxo e realmente exercitado, nunca no boot.
    const { GoogleAuth } = require('google-auth-library');

    const centralSaKeyFile = envStr('WEBSITE_MINT_SA_KEY_FILE') || undefined;
    const auth = new GoogleAuth({
      keyFile: centralSaKeyFile,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });

    const client = await auth.getClient();
    const centralAccessToken = (await client.getAccessToken())?.token;
    if (!centralAccessToken) {
      throw new Error('Nao foi possivel obter access token da service account central do mint (ADC ausente/invalido).');
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const customTokenPayload = {
      iss: targetServiceAccount,
      sub: targetServiceAccount,
      aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
      iat: nowSeconds,
      exp: nowSeconds + CUSTOM_TOKEN_TTL_SECONDS,
      uid,
      claims: input.claims || {},
    };

    const signJwtUrl = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(
      targetServiceAccount,
    )}:signJwt`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IAM_SIGN_JWT_TIMEOUT_MS);
    try {
      const response = await fetch(signJwtUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${centralAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ payload: JSON.stringify(customTokenPayload) }),
      });

      const text = await response.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        // resposta nao-JSON tratada abaixo pelo !response.ok / !data?.signedJwt
      }

      if (!response.ok || !data?.signedJwt) {
        this.logger.warn(
          `WEBSITE_MINT_SIGN_JWT_FAILED status=${response.status} targetServiceAccount=${targetServiceAccount} ` +
            `firebaseProjectId=${firebaseProjectId} body=${text.slice(0, 300)}`,
        );
        throw new Error(
          `IAM signJwt falhou (status ${response.status}). Confirme que a SA central (${this.mintSaEmail()}) tem ` +
            `roles/iam.serviceAccountTokenCreator sobre ${targetServiceAccount}.`,
        );
      }

      return { customToken: String(data.signedJwt), expiresInSeconds: CUSTOM_TOKEN_TTL_SECONDS };
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Usado so em log estruturado — nunca decide fluxo. */
  debugRequestId(): string {
    return randomUUID();
  }
}
