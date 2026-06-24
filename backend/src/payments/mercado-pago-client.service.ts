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
  card?: {
    first_six_digits?: string;
    last_four_digits?: string;
    payment_method?: {
      id?: string;
      name?: string;
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
  // Cobrança avulsa de cartão (one-off, ex.: diferença proporcional do upgrade):
  // o token vem do navegador (SDK do MP), o cartão nunca passa pelo backend.
  token?: string;
  installments?: number;
  issuer_id?: string;
  notification_url?: string;
  external_reference?: string;
  metadata?: Record<string, unknown>;
  payer: {
    email: string;
    first_name?: string;
    last_name?: string;
    // CPF/CNPJ do pagador — exigido pelo MP em pagamento de cartão no Brasil.
    identification?: { type?: string; number?: string };
  };
};

export type MercadoPagoPreapprovalPlanPayload = {
  reason: string;
  auto_recurring: {
    frequency: number;
    frequency_type: 'days' | 'months';
    transaction_amount: number;
    currency_id: string;
    repetitions?: number;
    billing_day?: number;
    billing_day_proportional?: boolean;
    free_trial?: {
      frequency: number;
      frequency_type: 'days' | 'months';
    };
  };
  payment_methods_allowed?: Record<string, unknown>;
  back_url?: string;
};

export type MercadoPagoPreapprovalPlanResponse = {
  id?: string;
  reason?: string;
  status?: string;
  auto_recurring?: Record<string, unknown>;
  back_url?: string;
};

export type MercadoPagoPreapprovalPayload = {
  preapproval_plan_id?: string;
  reason: string;
  external_reference?: string;
  payer_email: string;
  card_token_id?: string;
  auto_recurring?: {
    frequency: number;
    frequency_type: 'days' | 'months';
    transaction_amount: number;
    currency_id: string;
    start_date?: string;
    end_date?: string;
  };
  back_url?: string;
  status?: 'authorized' | 'pending' | string;
};

export type MercadoPagoPreapprovalResponse = {
  id?: string;
  payer_id?: number | string;
  payer_email?: string;
  back_url?: string;
  collector_id?: number | string;
  application_id?: number | string;
  status?: string;
  reason?: string;
  external_reference?: string;
  preapproval_plan_id?: string;
  auto_recurring?: {
    frequency?: number;
    frequency_type?: string;
    transaction_amount?: number;
    currency_id?: string;
    start_date?: string;
    end_date?: string;
  };
  next_payment_date?: string;
  date_created?: string;
  last_modified?: string;
  card_id?: string;
  payment_method_id?: string;
  summarized?: Record<string, unknown>;
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

  async createPreapprovalPlan(
    accessTokenRaw: string,
    payload: MercadoPagoPreapprovalPlanPayload,
    idempotencyKey: string,
  ): Promise<MercadoPagoPreapprovalPlanResponse> {
    const accessToken = this.normalizeAccessToken(accessTokenRaw);
    if (!accessToken) throw new Error('Access token do Mercado Pago nao informado.');

    try {
      const response = await axios.post<MercadoPagoPreapprovalPlanResponse>(
        `${this.apiBase}/preapproval_plan`,
        payload,
        {
          headers: this.buildHeaders(accessToken, idempotencyKey),
          timeout: 20000,
        },
      );
      return response.data || {};
    } catch (error: any) {
      throw new Error(this.parseApiError(error, 'Falha ao criar plano de assinatura no Mercado Pago.'));
    }
  }

  async createPreapproval(
    accessTokenRaw: string,
    payload: MercadoPagoPreapprovalPayload,
    idempotencyKey: string,
  ): Promise<MercadoPagoPreapprovalResponse> {
    const accessToken = this.normalizeAccessToken(accessTokenRaw);
    if (!accessToken) throw new Error('Access token do Mercado Pago nao informado.');

    try {
      const response = await axios.post<MercadoPagoPreapprovalResponse>(
        `${this.apiBase}/preapproval`,
        payload,
        {
          headers: this.buildHeaders(accessToken, idempotencyKey),
          timeout: 20000,
        },
      );
      return response.data || {};
    } catch (error: any) {
      throw new Error(this.parseApiError(error, 'Falha ao criar assinatura no Mercado Pago.'));
    }
  }

  async getPreapproval(
    accessTokenRaw: string,
    preapprovalIdRaw: string | number,
  ): Promise<MercadoPagoPreapprovalResponse> {
    const accessToken = this.normalizeAccessToken(accessTokenRaw);
    const preapprovalId = String(preapprovalIdRaw || '').trim();
    if (!accessToken) throw new Error('Access token do Mercado Pago nao informado.');
    if (!preapprovalId) throw new Error('preapproval_id do Mercado Pago nao informado.');

    try {
      const response = await axios.get<MercadoPagoPreapprovalResponse>(
        `${this.apiBase}/preapproval/${encodeURIComponent(preapprovalId)}`,
        {
          headers: this.buildHeaders(accessToken),
          timeout: 20000,
        },
      );
      return response.data || {};
    } catch (error: any) {
      throw new Error(this.parseApiError(error, `Falha ao consultar assinatura ${preapprovalId} no Mercado Pago.`));
    }
  }

  async updatePreapproval(
    accessTokenRaw: string,
    preapprovalIdRaw: string | number,
    payload: Record<string, unknown>,
  ): Promise<MercadoPagoPreapprovalResponse> {
    const accessToken = this.normalizeAccessToken(accessTokenRaw);
    const preapprovalId = String(preapprovalIdRaw || '').trim();
    if (!accessToken) throw new Error('Access token do Mercado Pago nao informado.');
    if (!preapprovalId) throw new Error('preapproval_id do Mercado Pago nao informado.');

    try {
      const response = await axios.put<MercadoPagoPreapprovalResponse>(
        `${this.apiBase}/preapproval/${encodeURIComponent(preapprovalId)}`,
        payload,
        {
          headers: this.buildHeaders(accessToken),
          timeout: 20000,
        },
      );
      return response.data || {};
    } catch (error: any) {
      throw new Error(this.parseApiError(error, `Falha ao atualizar assinatura ${preapprovalId} no Mercado Pago.`));
    }
  }

  async cancelPreapproval(
    accessTokenRaw: string,
    preapprovalIdRaw: string | number,
  ): Promise<MercadoPagoPreapprovalResponse> {
    return this.updatePreapproval(accessTokenRaw, preapprovalIdRaw, { status: 'canceled' });
  }

  async pausePreapproval(
    accessTokenRaw: string,
    preapprovalIdRaw: string | number,
  ): Promise<MercadoPagoPreapprovalResponse> {
    return this.updatePreapproval(accessTokenRaw, preapprovalIdRaw, { status: 'paused' });
  }

  async changePreapprovalCard(
    accessTokenRaw: string,
    preapprovalIdRaw: string | number,
    cardTokenIdRaw: string,
  ): Promise<MercadoPagoPreapprovalResponse> {
    const cardTokenId = String(cardTokenIdRaw || '').trim();
    if (!cardTokenId) throw new Error('card_token_id do Mercado Pago nao informado.');
    return this.updatePreapproval(accessTokenRaw, preapprovalIdRaw, { card_token_id: cardTokenId });
  }

  async searchPreapproval(
    accessTokenRaw: string,
    params: Record<string, string | number | boolean | undefined | null>,
  ): Promise<Record<string, unknown>> {
    const accessToken = this.normalizeAccessToken(accessTokenRaw);
    if (!accessToken) throw new Error('Access token do Mercado Pago nao informado.');

    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params || {})) {
      if (value === undefined || value === null || value === '') continue;
      query.set(key, String(value));
    }

    try {
      const response = await axios.get<Record<string, unknown>>(
        `${this.apiBase}/preapproval/search${query.size ? `?${query.toString()}` : ''}`,
        {
          headers: this.buildHeaders(accessToken),
          timeout: 20000,
        },
      );
      return response.data || {};
    } catch (error: any) {
      throw new Error(this.parseApiError(error, 'Falha ao buscar assinaturas no Mercado Pago.'));
    }
  }
}
