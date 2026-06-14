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
