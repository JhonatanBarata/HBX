export type RecoveryNormalizedMetaHeaderFormat =
  | 'NONE'
  | 'TEXT'
  | 'IMAGE'
  | 'DOCUMENT'
  | 'VIDEO';

export type RecoveryNormalizedMetaTemplateButton = {
  type: string;
  text: string | null;
  url: string | null;
  phoneNumber: string | null;
};

export type RecoveryNormalizedMetaTemplate = {
  name: string;
  language: string;
  category: string;
  status: string;
  qualityScore: string | null;
  rejectedReason: string | null;
  header: {
    format: RecoveryNormalizedMetaHeaderFormat;
    text: string | null;
    exampleHandle: string | null;
    mediaUrl: string | null;
    mediaFileName: string | null;
    mediaContentType: string | null;
    mediaBase64: string | null;
  };
  body: {
    text: string;
    variableOrder: string[];
    variableExamples: Record<string, string>;
  };
  footer: {
    text: string | null;
  };
  buttons: RecoveryNormalizedMetaTemplateButton[];
  components: Array<Record<string, unknown>>;
};

type BuildNormalizedMetaTemplateInput = {
  name: string;
  language: string;
  category: string;
  status: string;
  qualityScore?: string | null;
  rejectedReason?: string | null;
  components?: unknown;
  fallback?: {
    headerFormat?: string | null;
    headerText?: string | null;
    headerHandle?: string | null;
    headerMediaUrl?: string | null;
    headerMediaFileName?: string | null;
    headerMediaContentType?: string | null;
    headerMediaBase64?: string | null;
    bodyText?: string | null;
    footerText?: string | null;
    buttonLabels?: string[];
    variableKeys?: string[];
  };
};

export function normalizeMetaTemplateStatus(statusRaw: string | null | undefined) {
  return String(statusRaw || 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
}

export function normalizeMetaTemplateCategory(categoryRaw: string | null | undefined) {
  return String(categoryRaw || 'UTILITY').trim().toUpperCase() || 'UTILITY';
}

export function normalizeMetaTemplateHeaderFormat(
  formatRaw: string | null | undefined,
): RecoveryNormalizedMetaHeaderFormat {
  const normalized = String(formatRaw || '').trim().toUpperCase();
  if (
    normalized === 'TEXT' ||
    normalized === 'IMAGE' ||
    normalized === 'DOCUMENT' ||
    normalized === 'VIDEO'
  ) {
    return normalized;
  }
  return 'NONE';
}

export function normalizeMetaTemplateRejectionReason(reasonRaw: string | null | undefined) {
  const normalized = String(reasonRaw || '').trim();
  if (!normalized) return null;
  if (normalized.toUpperCase() === 'NONE' || normalized.toLowerCase() === 'null') return null;
  return normalized;
}

export function isMetaMediaHeaderFormat(formatRaw: string | null | undefined) {
  const normalized = normalizeMetaTemplateHeaderFormat(formatRaw);
  return normalized === 'IMAGE' || normalized === 'DOCUMENT' || normalized === 'VIDEO';
}

export function extractNumericTemplateVariablesInOrder(textRaw: string | null | undefined) {
  const variables: string[] = [];
  const pattern = /\{\{\s*(\d+)\s*\}\}/g;
  let match: RegExpExecArray | null = null;
  while (true) {
    match = pattern.exec(String(textRaw || ''));
    if (!match?.[1]) break;
    const key = String(match[1]);
    if (!variables.includes(key)) variables.push(key);
  }
  return variables;
}

function extractTemplateVariablesInOrder(textRaw: string | null | undefined) {
  const variables: string[] = [];
  const pattern = /\{\{\s*([\p{L}\p{N}_]+)\s*\}\}/gu;
  let match: RegExpExecArray | null = null;
  while (true) {
    match = pattern.exec(String(textRaw || ''));
    if (!match?.[1]) break;
    const key = String(match[1]).trim();
    if (key && !variables.includes(key)) variables.push(key);
  }
  return variables;
}

function cloneComponent(component: unknown) {
  if (!component || typeof component !== 'object' || Array.isArray(component)) {
    return {} as Record<string, unknown>;
  }
  return JSON.parse(JSON.stringify(component)) as Record<string, unknown>;
}

function buildBodyVariableExamples(
  variableOrder: string[],
  bodyComponent: Record<string, unknown> | null,
) {
  const examples: Record<string, string> = {};
  const exampleRows = (bodyComponent?.example as { body_text?: unknown } | undefined)?.body_text;
  const exampleValues = Array.isArray(exampleRows) && Array.isArray(exampleRows[0])
    ? (exampleRows[0] as unknown[])
    : [];
  variableOrder.forEach((key, index) => {
    const value = String(exampleValues[index] ?? '').trim();
    if (value) examples[key] = value;
  });
  return examples;
}

export function buildNormalizedMetaTemplate(
  input: BuildNormalizedMetaTemplateInput,
): RecoveryNormalizedMetaTemplate {
  const components = Array.isArray(input.components)
    ? input.components
        .filter((component) => component && typeof component === 'object' && !Array.isArray(component))
        .map((component) => cloneComponent(component))
    : [];
  const headerComponent =
    components.find(
      (component) => String(component.type || '').trim().toUpperCase() === 'HEADER',
    ) || null;
  const bodyComponent =
    components.find((component) => String(component.type || '').trim().toUpperCase() === 'BODY') || null;
  const footerComponent =
    components.find(
      (component) => String(component.type || '').trim().toUpperCase() === 'FOOTER',
    ) || null;
  const buttonComponents = components.filter(
    (component) => String(component.type || '').trim().toUpperCase() === 'BUTTONS',
  );

  const fallback = input.fallback || {};
  const headerFormat = headerComponent
    ? normalizeMetaTemplateHeaderFormat(String(headerComponent.format || ''))
    : normalizeMetaTemplateHeaderFormat(fallback.headerFormat);
  const fallbackBodyText =
    fallback.bodyText !== undefined && fallback.bodyText !== null
      ? String(fallback.bodyText)
      : '';
  const bodyText = fallbackBodyText || (bodyComponent ? String(bodyComponent.text ?? '') : '');
  const fallbackVariableKeys = Array.isArray(fallback.variableKeys)
    ? fallback.variableKeys.map((item) => String(item || '').trim()).filter((item) => item.length > 0)
    : [];
  const variableOrder = fallbackVariableKeys.length
    ? fallbackVariableKeys
    : bodyComponent
      ? extractNumericTemplateVariablesInOrder(String(bodyComponent.text ?? ''))
      : extractTemplateVariablesInOrder(bodyText);
  const buttons = buttonComponents.flatMap((component) => {
    const entries = Array.isArray(component.buttons) ? component.buttons : [];
    return entries
      .filter((button) => button && typeof button === 'object' && !Array.isArray(button))
      .map((button) => ({
        type: String((button as Record<string, unknown>).type || '').trim().toUpperCase() || 'UNKNOWN',
        text:
          (button as Record<string, unknown>).text !== undefined &&
          (button as Record<string, unknown>).text !== null
            ? String((button as Record<string, unknown>).text)
            : null,
        url:
          (button as Record<string, unknown>).url !== undefined &&
          (button as Record<string, unknown>).url !== null
            ? String((button as Record<string, unknown>).url)
            : null,
        phoneNumber:
          (button as Record<string, unknown>).phone_number !== undefined &&
          (button as Record<string, unknown>).phone_number !== null
            ? String((button as Record<string, unknown>).phone_number)
            : null,
      }));
  });
  const fallbackButtons = Array.isArray(fallback.buttonLabels)
    ? fallback.buttonLabels
        .map((text) => String(text || ''))
        .filter((text) => text.length > 0)
        .map((text) => ({ type: 'QUICK_REPLY', text, url: null, phoneNumber: null }))
    : [];

  const normalized: RecoveryNormalizedMetaTemplate = {
    name: String(input.name || '').trim(),
    language: String(input.language || 'pt_BR').trim() || 'pt_BR',
    category: normalizeMetaTemplateCategory(input.category),
    status: normalizeMetaTemplateStatus(input.status),
    qualityScore:
      input.qualityScore !== undefined && input.qualityScore !== null
        ? String(input.qualityScore).trim() || null
        : null,
    rejectedReason: normalizeMetaTemplateRejectionReason(input.rejectedReason),
    header: {
      format: headerFormat,
      text:
        headerComponent && headerFormat === 'TEXT'
          ? String(headerComponent.text ?? '')
          : fallback.headerText !== undefined && fallback.headerText !== null
            ? String(fallback.headerText)
            : null,
      exampleHandle:
        headerComponent && (headerComponent.example as { header_handle?: unknown } | undefined)
          ? (() => {
              const values = (headerComponent.example as { header_handle?: unknown }).header_handle;
              if (Array.isArray(values) && values.length > 0) return String(values[0] ?? '').trim() || null;
              return null;
            })()
          : fallback.headerHandle !== undefined && fallback.headerHandle !== null
            ? String(fallback.headerHandle).trim() || null
            : null,
      mediaUrl:
        fallback.headerMediaUrl !== undefined && fallback.headerMediaUrl !== null
          ? String(fallback.headerMediaUrl).trim() || null
          : null,
      mediaFileName:
        fallback.headerMediaFileName !== undefined && fallback.headerMediaFileName !== null
          ? String(fallback.headerMediaFileName).trim() || null
          : null,
      mediaContentType:
        fallback.headerMediaContentType !== undefined && fallback.headerMediaContentType !== null
          ? String(fallback.headerMediaContentType).trim() || null
          : null,
      mediaBase64:
        fallback.headerMediaBase64 !== undefined && fallback.headerMediaBase64 !== null
          ? String(fallback.headerMediaBase64).trim() || null
          : null,
    },
    body: {
      text: bodyText,
      variableOrder,
      variableExamples: bodyComponent
        ? buildBodyVariableExamples(variableOrder, bodyComponent)
        : Object.fromEntries(
            variableOrder.map((key) => [key, '']).filter((entry) => Boolean(entry[0])),
          ),
    },
    footer: {
      text:
        footerComponent !== null
          ? String(footerComponent.text ?? '')
          : fallback.footerText !== undefined && fallback.footerText !== null
            ? String(fallback.footerText)
            : null,
    },
    buttons: buttons.length ? buttons : fallbackButtons,
    components,
  };

  if (normalized.header.format === 'NONE') {
    normalized.header.text = null;
    normalized.header.exampleHandle = null;
    normalized.header.mediaUrl = null;
    normalized.header.mediaFileName = null;
    normalized.header.mediaContentType = null;
    normalized.header.mediaBase64 = null;
  }
  if (normalized.header.format === 'TEXT') {
    normalized.header.mediaUrl = null;
    normalized.header.mediaFileName = null;
    normalized.header.mediaContentType = null;
    normalized.header.mediaBase64 = null;
  }
  if (!normalized.footer.text) normalized.footer.text = null;
  normalized.rejectedReason = normalizeMetaTemplateRejectionReason(normalized.rejectedReason);
  return normalized;
}
