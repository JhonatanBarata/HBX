import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

export type VerifiedGoogleIdentity = {
  googleId: string;
  email: string;
};

@Injectable()
export class GoogleIdTokenVerifierService {
  protected createClient(clientId: string) {
    return new OAuth2Client(clientId);
  }

  async verify(idTokenInput: unknown): Promise<VerifiedGoogleIdentity> {
    const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
    if (!clientId) {
      throw new ServiceUnavailableException('Entrada com Google não está configurada neste ambiente.');
    }

    const idToken = String(idTokenInput || '').trim();
    try {
      const ticket = await this.createClient(clientId).verifyIdToken({
        idToken,
        audience: clientId,
      });
      const payload = ticket.getPayload();
      const googleId = String(payload?.sub || '').trim();
      const email = String(payload?.email || '').trim().toLowerCase();

      // O vínculo por e-mail só é seguro quando o próprio Google confirmou a
      // caixa. `verifyIdToken` também valida assinatura, emissor, audiência e
      // expiração antes de chegarmos aqui.
      if (!googleId || !email || payload?.email_verified !== true) {
        throw new Error('Identidade Google sem e-mail verificado.');
      }

      return { googleId, email };
    } catch {
      throw new UnauthorizedException('Token Google inválido, expirado ou sem e-mail verificado.');
    }
  }
}
