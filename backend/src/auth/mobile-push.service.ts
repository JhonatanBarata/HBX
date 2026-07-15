import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { GoogleAuth } from 'google-auth-library';

export type MobilePushResult = {
  sent: boolean;
  reason?: string;
  unregistered?: boolean;
};

/**
 * O FCM é somente uma campainha: nenhum dado da ação comercial sai no push.
 * O conteúdo completo continua existindo apenas na fila persistida do VPS e é
 * recuperado pelo APK em /mobile/actions/pull.
 */
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
          credentials,
          scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
        }),
      };
      return this.configCache;
    } catch {
      this.configCache = null;
      return null;
    }
  }

  async sendWake(pushToken: string | null | undefined): Promise<MobilePushResult> {
    const token = String(pushToken || '').trim();
    if (!token) return { sent: false, reason: 'push_token_missing' };

    const cfg = this.config();
    if (!cfg) return { sent: false, reason: 'firebase_not_configured' };

    try {
      const client = await cfg.auth.getClient();
      const requestHeaders = await client.getRequestHeaders();
      const authorization = String(
        (requestHeaders as Record<string, unknown>).Authorization ||
          (requestHeaders as Record<string, unknown>).authorization ||
          '',
      );
      if (!authorization) return { sent: false, reason: 'firebase_auth_failed' };

      await axios.post(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(cfg.projectId)}/messages:send`,
        {
          message: {
            token,
            data: {
              type: 'mobile_actions_available',
              queue: 'mobile_actions',
            },
            android: {
              priority: 'high',
              ttl: '300s',
              collapse_key: 'hbx_mobile_actions',
            },
          },
        },
        {
          headers: {
            Authorization: authorization,
            'Content-Type': 'application/json',
          },
          timeout: 8_000,
        },
      );
      return { sent: true };
    } catch (error) {
      const status = Number((error as { response?: { status?: number } })?.response?.status || 0);
      const payload = (error as { response?: { data?: unknown } })?.response?.data;
      const responseText = JSON.stringify(payload || '').toUpperCase();
      const unregistered = status === 404 || responseText.includes('UNREGISTERED');
      return {
        sent: false,
        reason: unregistered ? 'push_token_unregistered' : `firebase_${status || 'error'}`,
        unregistered,
      };
    }
  }
}
