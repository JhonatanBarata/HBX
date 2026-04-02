import { Injectable } from '@nestjs/common';
import axios from 'axios';

export type MercadoPagoUserProfile = {
  id?: number | string;
  email?: string;
  nickname?: string;
};

export type MercadoPagoPreferencePayload = {
  external_reference?: string;
  notification_url?: string;
  back_urls?: {
    success?: string;
    failure?: string;
    pending?: string;
  };
  auto_return?: string;
  payment_methods?: Record<string, unknown>;
  payer?: {
    name?: string;
    email?: string;
    phone?: {
      number?: string;
    };
  };
  metadata?: Record<string, unknown>;
  items: Array<{
    id?: string;
    title: string;
    description?: string;
    quantity: number;
    unit_price: number;
    currency_id?: string;
  }>;
  expires?: boolean;
  date_of_expiration?: string;
};

export type MercadoPagoPreferenceResponse = {
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
  external_reference?: string;
};

export type MercadoPagoPaymentResponse = {
  id?: number | string;
  status?: string;
  status_detail?: string;
  transaction_amount?: number;
  transaction_amount_refunded?: number;
  date_created?: string;
  date_approved?: string;
  date_last_updated?: string;
  external_reference?: string;
  metadata?: Record<string, unknown>;
  order?: { id?: number | string };
  payer?: {
    email?: string;
    first_name?: string;
    last_name?: string;
    phone?: {
      number?: string;
    };
  };
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
};

export type MercadoPagoRefundResponse = {
  id?: number | string;
  payment_id?: number | string;
  amount?: number;
  status?: string;
};

export type MercadoPagoCreatePaymentPayload = {
  transaction_amount: number;
  description: string;
  payment_method_id: string;
  notification_url?: string;
  external_reference?: string;
  metadata?: Record<string, unknown>;
  payer: {
    email: string;
    first_name?: string;
    last_name?: string;
  };
};

@Injectable()
export class MercadoPagoClientService {
  private readonly apiBase = 'https://api.mercadopago.com';

  private normalizeAccessToken(token: string) {
    return String(token || '').trim();
  }

  private buildHeaders(token: string, idempotencyKey?: string) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;
    return headers;
  }

  private parseApiError(error: any, fallback: string) {
    const responseData = error?.response?.data;
    const statusText = error?.response?.statusText;
    const statusCode = error?.response?.status;

    const apiMessage = String(
      responseData?.message ||
        responseData?.error_description ||
        responseData?.cause?.[0]?.description ||
        responseData?.cause?.[0]?.code ||
        responseData?.error ||
        '',
    ).trim();

    if (apiMessage) return apiMessage;
    if (statusCode && statusText) return `${statusCode} ${statusText}`;
    return fallback;
  }

  async validateAccessToken(accessTokenRaw: string): Promise<MercadoPagoUserProfile> {
    const accessToken = this.normalizeAccessToken(accessTokenRaw);
    if (!accessToken) throw new Error('Access token do Mercado Pago nao informado.');

    try {
      const response = await axios.get<MercadoPagoUserProfile>(`${this.apiBase}/users/me`, {
        headers: this.buildHeaders(accessToken),
        timeout: 15000,
      });
      return response.data || {};
    } catch (error: any) {
      throw new Error(this.parseApiError(error, 'Nao foi possivel validar o token do Mercado Pago.'));
    }
  }

  async createPreference(
    accessTokenRaw: string,
    payload: MercadoPagoPreferencePayload,
    idempotencyKey: string,
  ): Promise<MercadoPagoPreferenceResponse> {
    const accessToken = this.normalizeAccessToken(accessTokenRaw);
    if (!accessToken) throw new Error('Access token do Mercado Pago nao informado.');

    try {
      const response = await axios.post<MercadoPagoPreferenceResponse>(
        `${this.apiBase}/checkout/preferences`,
        payload,
        {
          headers: this.buildHeaders(accessToken, idempotencyKey),
          timeout: 20000,
        },
      );
      return response.data || {};
    } catch (error: any) {
      throw new Error(this.parseApiError(error, 'Falha ao criar checkout no Mercado Pago.'));
    }
  }

  async createPayment(
    accessTokenRaw: string,
    payload: MercadoPagoCreatePaymentPayload,
    idempotencyKey: string,
  ): Promise<MercadoPagoPaymentResponse> {
    const accessToken = this.normalizeAccessToken(accessTokenRaw);
    if (!accessToken) throw new Error('Access token do Mercado Pago nao informado.');

    try {
      const response = await axios.post<MercadoPagoPaymentResponse>(
        `${this.apiBase}/v1/payments`,
        payload,
        {
          headers: this.buildHeaders(accessToken, idempotencyKey),
          timeout: 20000,
        },
      );
      return response.data || {};
    } catch (error: any) {
      throw new Error(this.parseApiError(error, 'Falha ao criar pagamento no Mercado Pago.'));
    }
  }

  async getPayment(accessTokenRaw: string, paymentIdRaw: string | number): Promise<MercadoPagoPaymentResponse> {
    const accessToken = this.normalizeAccessToken(accessTokenRaw);
    const paymentId = String(paymentIdRaw || '').trim();
    if (!accessToken) throw new Error('Access token do Mercado Pago nao informado.');
    if (!paymentId) throw new Error('payment_id do Mercado Pago nao informado.');

    try {
      const response = await axios.get<MercadoPagoPaymentResponse>(`${this.apiBase}/v1/payments/${paymentId}`, {
        headers: this.buildHeaders(accessToken),
        timeout: 20000,
      });
      return response.data || {};
    } catch (error: any) {
      throw new Error(this.parseApiError(error, `Falha ao consultar pagamento ${paymentId} no Mercado Pago.`));
    }
  }

  async refundPayment(
    accessTokenRaw: string,
    paymentIdRaw: string | number,
    amount?: number,
  ): Promise<MercadoPagoRefundResponse> {
    const accessToken = this.normalizeAccessToken(accessTokenRaw);
    const paymentId = String(paymentIdRaw || '').trim();
    if (!accessToken) throw new Error('Access token do Mercado Pago nao informado.');
    if (!paymentId) throw new Error('payment_id do Mercado Pago nao informado.');

    const payload =
      typeof amount === 'number' && Number.isFinite(amount) && amount > 0 ? { amount: Number(amount.toFixed(2)) } : {};

    try {
      const response = await axios.post<MercadoPagoRefundResponse>(
        `${this.apiBase}/v1/payments/${paymentId}/refunds`,
        payload,
        {
          headers: this.buildHeaders(accessToken),
          timeout: 20000,
        },
      );
      return response.data || {};
    } catch (error: any) {
      throw new Error(this.parseApiError(error, `Falha ao solicitar estorno do pagamento ${paymentId}.`));
    }
  }
}
