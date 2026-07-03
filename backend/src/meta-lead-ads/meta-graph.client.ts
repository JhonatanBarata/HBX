import { Injectable } from '@nestjs/common';

export type MetaLeadField = { name: string; values: string[] };

export type MetaLeadDetail = {
  id: string;
  fieldData: MetaLeadField[];
  formId: string | null;
  adId: string | null;
  campaignName: string | null;
  createdTime: string | null;
};

export type MetaLeadForm = { id: string; name: string | null };

// ARQ11 S1 — resultado da assinatura da página no webhook (POST /{pageId}/subscribed_apps).
export type MetaSubscribeResult = { subscribed: boolean; error?: string };

const DEFAULT_GRAPH_VERSION = 'v19.0';

@Injectable()
export class MetaGraphClient {
  private graphVersion() {
    return String(process.env.META_GRAPH_VERSION || DEFAULT_GRAPH_VERSION).trim() || DEFAULT_GRAPH_VERSION;
  }

  // Busca o lead completo pelo leadgen_id usando o token da página.
  // Retorna null em qualquer falha (token inválido, lead removido, rede) — o
  // chamador trata como "não processado" e registra o erro na conexão.
  async fetchLead(leadgenId: string, accessToken: string): Promise<MetaLeadDetail | null> {
    const id = String(leadgenId || '').trim();
    const token = String(accessToken || '').trim();
    if (!id || !token) return null;

    const url =
      `https://graph.facebook.com/${this.graphVersion()}/${encodeURIComponent(id)}` +
      `?fields=field_data,created_time,form_id,ad_id,campaign_name&access_token=${encodeURIComponent(token)}`;

    try {
      const response = await fetch(url, { method: 'GET' });
      if (!response.ok) return null;
      const json: any = await response.json();
      if (!json || typeof json !== 'object' || json.error) return null;

      const fieldData: MetaLeadField[] = Array.isArray(json.field_data)
        ? json.field_data
            .filter((field: any) => field && field.name)
            .map((field: any) => ({
              name: String(field.name),
              values: Array.isArray(field.values) ? field.values.map((value: any) => String(value)) : [],
            }))
        : [];

      return {
        id,
        fieldData,
        formId: json.form_id ? String(json.form_id) : null,
        adId: json.ad_id ? String(json.ad_id) : null,
        campaignName: json.campaign_name ? String(json.campaign_name) : null,
        createdTime: json.created_time ? String(json.created_time) : null,
      };
    } catch {
      return null;
    }
  }

  // ARQ11 S1 — lista os formulários de lead de uma página (reconciliação diária).
  // Retorna [] em qualquer falha (nunca lança) — mesmo padrão de fetchLead.
  async listForms(pageId: string, accessToken: string): Promise<MetaLeadForm[]> {
    const id = String(pageId || '').trim();
    const token = String(accessToken || '').trim();
    if (!id || !token) return [];

    const url =
      `https://graph.facebook.com/${this.graphVersion()}/${encodeURIComponent(id)}/leadgen_forms` +
      `?fields=id,name&limit=100&access_token=${encodeURIComponent(token)}`;

    try {
      const response = await fetch(url, { method: 'GET' });
      if (!response.ok) return [];
      const json: any = await response.json();
      if (!json || typeof json !== 'object' || json.error || !Array.isArray(json.data)) return [];
      return json.data
        .filter((form: any) => form && form.id)
        .map((form: any) => ({ id: String(form.id), name: form.name ? String(form.name) : null }));
    } catch {
      return [];
    }
  }

  // ARQ11 S1 — lista os leads de um formulário (reconciliação). `sinceUnix` filtra pela
  // janela de tempo (padrão 72h no chamador). Retorna só { id } — o worker busca o detalhe
  // via fetchLead pelo caminho normal. [] em qualquer falha.
  async listLeads(formId: string, accessToken: string, sinceUnix?: number): Promise<Array<{ id: string; createdTime: string | null }>> {
    const id = String(formId || '').trim();
    const token = String(accessToken || '').trim();
    if (!id || !token) return [];

    let url =
      `https://graph.facebook.com/${this.graphVersion()}/${encodeURIComponent(id)}/leads` +
      `?fields=id,created_time&limit=200&access_token=${encodeURIComponent(token)}`;
    if (Number.isFinite(sinceUnix) && (sinceUnix as number) > 0) {
      url += `&filtering=${encodeURIComponent(JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: Math.trunc(sinceUnix as number) }]))}`;
    }

    try {
      const response = await fetch(url, { method: 'GET' });
      if (!response.ok) return [];
      const json: any = await response.json();
      if (!json || typeof json !== 'object' || json.error || !Array.isArray(json.data)) return [];
      return json.data
        .filter((lead: any) => lead && lead.id)
        .map((lead: any) => ({ id: String(lead.id), createdTime: lead.created_time ? String(lead.created_time) : null }));
    } catch {
      return [];
    }
  }

  // ARQ11 S1 — assina a página no webhook do app (POST /{pageId}/subscribed_apps com
  // subscribed_fields=['leadgen']) + GET de conferência. Sem isto, o Meta NÃO manda evento
  // de lead — cadastrar pageId+token no admin não basta. Nunca lança: devolve
  // { subscribed, error? } com contrato fixo para o endpoint admin repassar direto.
  async subscribePage(pageId: string, accessToken: string): Promise<MetaSubscribeResult> {
    const id = String(pageId || '').trim();
    const token = String(accessToken || '').trim();
    if (!id || !token) return { subscribed: false, error: 'pageId ou token ausente.' };

    const base = `https://graph.facebook.com/${this.graphVersion()}/${encodeURIComponent(id)}/subscribed_apps`;
    const postUrl =
      `${base}?subscribed_fields=${encodeURIComponent('leadgen')}&access_token=${encodeURIComponent(token)}`;

    try {
      const postResponse = await fetch(postUrl, { method: 'POST' });
      const postJson: any = await postResponse.json().catch(() => null);
      if (!postResponse.ok || (postJson && postJson.error)) {
        const message = String(postJson?.error?.message || `HTTP ${postResponse.status}`).slice(0, 300);
        return { subscribed: false, error: message };
      }
      if (postJson && postJson.success === false) {
        return { subscribed: false, error: 'Meta recusou a assinatura (success=false).' };
      }

      // GET de conferência: a página deve aparecer com 'leadgen' entre os subscribed_fields.
      const getUrl = `${base}?access_token=${encodeURIComponent(token)}`;
      const getResponse = await fetch(getUrl, { method: 'GET' });
      const getJson: any = await getResponse.json().catch(() => null);
      if (getResponse.ok && getJson && Array.isArray(getJson.data)) {
        const hasLeadgen = getJson.data.some((app: any) => {
          const fields = Array.isArray(app?.subscribed_fields) ? app.subscribed_fields.map((f: any) => String(f)) : [];
          return fields.includes('leadgen');
        });
        // O POST já retornou sucesso; se a conferência não achar 'leadgen' ainda assim
        // consideramos assinado (o Graph às vezes demora a refletir), mas registramos aviso.
        if (!hasLeadgen) {
          return { subscribed: true, error: 'Assinatura aceita mas leadgen não confirmado na conferência.' };
        }
      }
      return { subscribed: true };
    } catch (error: any) {
      return { subscribed: false, error: String(error?.message || 'Falha de rede ao assinar a página.').slice(0, 300) };
    }
  }
}

// Mapeia o field_data do Meta (array de { name, values }) para campos do lead.
// Cobre os nomes padrão do Meta + variações em português comuns nos formulários.
export function mapMetaLeadFields(fieldData: MetaLeadField[]) {
  const pick = (keys: string[]) => {
    for (const field of fieldData) {
      const name = String(field?.name || '').trim().toLowerCase();
      if (keys.includes(name)) {
        const value = Array.isArray(field.values) ? field.values.find(Boolean) : null;
        if (value) return String(value).trim();
      }
    }
    return null;
  };

  const fullName = pick(['full_name', 'name', 'nome', 'nome_completo']);
  const firstName = pick(['first_name', 'primeiro_nome']);
  const lastName = pick(['last_name', 'sobrenome']);
  const name = fullName || [firstName, lastName].filter(Boolean).join(' ').trim() || null;

  return {
    name: name || null,
    phone: pick(['phone_number', 'phone', 'telefone', 'celular', 'whatsapp', 'whatsapp_number']),
    email: pick(['email', 'e-mail', 'e_mail']),
    city: pick(['city', 'cidade']),
    state: pick(['state', 'estado', 'uf']),
  };
}
