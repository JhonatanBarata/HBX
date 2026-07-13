import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { GoogleAuth } from 'google-auth-library';

type PushAction = {
  id: string;
  kind: 'call' | 'whatsapp';
  phone: string;
  contactName?: string | null;
  message?: string | null;
  leadId?: string | null;
};

type PushResult = {
  sent: boolean;
  reason?: string;
  unregistered?: boolean;
};

@Injectable()
export class MobilePushService {
  private configCache: { auth: GoogleAuth; projectId: string } | null | undefined;

  private config() {
    if (this.configCache !== undefined) return this.configCache;

    const raw = String(process.env.HBX_FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
    if (!raw) {
      this.configCache = null;
      return null;
    }

    try {
      const credentials = JSON.parse(raw) as Record<string, unknown>;
      const projectId = String(
        process.env.HBX_FIREBASE_PROJECT_ID || credentials.project_id || '',
      ).trim();
      if (!projectId) {
        this.configCache = null;
        return null;
      }
      this.configCache = {
        projectId,
        auth: new GoogleAuth({
          credentials: credentials as any,
          scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
        }),
      };
      return this.configCache;
    } catch {
      this.configCache = null;
      return null;
    }
  }

  async sendAction(pushToken: string | null | undefined, action: PushAction): Promise<PushResult> {
    const token = String(pushToken || '').trim();
    if (!token) return { sent: false, reason: 'push_token_missing' };

    const cfg = this.config();
    if (!cfg) return { sent: false, reason: 'firebase_not_configured' };

    try {
      const accessToken = await cfg.auth.getAccessToken();
      if (!accessToken) return { sent: false, reason: 'firebase_auth_failed' };

      const contactName = String(action.contactName || 'Lead').trim() || 'Lead';
      const title = action.kind === 'call'
        ? `Ligação para ${contactName}`
        : `WhatsApp para ${contactName}`;
      const body = action.kind === 'call'
        ? 'Toque para abrir o número no discador e registrar o resultado.'
        : 'Toque para abrir a conversa com a mensagem preparada.';

      await axios.post(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(cfg.projectId)}/messages:send`,
        {
          message: {
            token,
            // Data-only é intencional: HbxFirebaseMessagingService recebe também em
            // background e cria PendingIntent para MobileActionActivity. Com o bloco
            // `notification`, o Android abriria só o launcher e perderia a ação.
            data: {
              actionId: action.id,
              kind: action.kind,
              phone: action.phone,
              contactName,
              message: String(action.message || ''),
              leadId: String(action.leadId || ''),
              title,
              body,
            },
            android: {
              priority: 'high',
              ttl: '86400s',
            },
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 12_000,
        },
      );
      return { sent: true };
    } catch (error) {
      const status = Number((error as { response?: { status?: number } })?.response?.status || 0);
      const payload = (error as { response?: { data?: unknown } })?.response?.data;
      const text = JSON.stringify(payload || '').toUpperCase();
      const unregistered = status === 404 || text.includes('UNREGISTERED');
      return {
        sent: false,
        reason: unregistered ? 'push_token_unregistered' : `firebase_${status || 'error'}`,
        unregistered,
      };
    }
  }
}
