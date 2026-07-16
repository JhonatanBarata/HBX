#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(process.env.HBX_DETAIL_POLISH_ROOT || process.cwd());
const pagePath = path.join(root, "src/components/hbx/detalhes-negocio.tsx");
const marker = "export function formatPhoneDisplay";
const cssMarker = "dn-root--vendas";

function fail(message) {
  throw new Error(`[vendas-detail-card] ${message}`);
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

function replaceOnce(text, oldValue, newValue, label) {
  const occurrences = count(text, oldValue);
  if (occurrences !== 1) {
    fail(`${label}: esperado 1 trecho, encontrado ${occurrences}`);
  }
  return text.replace(oldValue, newValue);
}

function replaceBetween(text, startMarker, endMarker, replacement, label) {
  const startCount = count(text, startMarker);
  const endCount = count(text, endMarker);
  if (startCount !== 1 || endCount < 1) {
    fail(`${label}: marcadores incompatíveis (início=${startCount}, fim=${endCount})`);
  }
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (end < 0) fail(`${label}: marcador final não encontrado depois do início`);
  return text.slice(0, start) + replacement + text.slice(end);
}

if (!fs.existsSync(pagePath)) {
  fail(`arquivo não encontrado: ${pagePath}`);
}

let page = fs.readFileSync(pagePath, "utf8");

if (page.includes(marker)) {
  if (!page.includes(cssMarker)) {
    fail("patch parcial detectado: helper existe, mas o modificador visual não");
  }
  if (!page.includes("REGRA SAGRADA")) {
    fail("contrato de transições ausente");
  }
  if (count(page, "<TypedText") < 10 || count(page, "dn-kv-row") < 10) {
    fail("as costuras de escrita/animação parecem incompletas");
  }
  console.log("[vendas-detail-card] patch já aplicado; nenhuma alteração necessária.");
  process.exit(0);
}

const typedBefore = count(page, "<TypedText");
const kvBefore = count(page, "dn-kv-row");

const phoneHelper = `export function formatPhoneDisplay(value: string | null | undefined): string {
  const original = String(value || "").trim();
  if (!original) return "—";

  let digits = original.replace(/\\D/g, "");
  let country = "";
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    country = "+55 ";
    digits = digits.slice(2);
  }

  if (digits.length === 11) {
    return \`\${country}(\${digits.slice(0, 2)}) \${digits.slice(2, 7)}-\${digits.slice(7)}\`;
  }
  if (digits.length === 10) {
    return \`\${country}(\${digits.slice(0, 2)}) \${digits.slice(2, 6)}-\${digits.slice(6)}\`;
  }
  return original;
}

`;

page = replaceOnce(
  page,
  "function fmtSourceLabel(sourceType?: string | null, primarySource?: string | null) {",
  phoneHelper + "function fmtSourceLabel(sourceType?: string | null, primarySource?: string | null) {",
  "inserir formatPhoneDisplay",
);

page = replaceOnce(
  page,
  '  const [semInteresseOpen, setSemInteresseOpen] = useState(false);\n',
  `  const [semInteresseOpen, setSemInteresseOpen] = useState(false);
  const [deleteArm, setDeleteArm] = useState(false);
  useEffect(() => {
    if (!deleteArm) return;
    const timer = window.setTimeout(() => setDeleteArm(false), 3000);
    return () => window.clearTimeout(timer);
  }, [deleteArm]);
`,
  "estado de confirmação da exclusão",
);

page = replaceOnce(
  page,
  "  const ent = useEntitlements();\n",
  "  const ent = useEntitlements();\n  const waOpenMode = useWaOpenMode();\n",
  "modo de abertura do WhatsApp",
);

page = replaceOnce(
  page,
  "  const fieldPending = (has: boolean) => isEnriching && !has;\n",
  `  const fieldPending = (has: boolean) => isEnriching && !has;
  const primaryWaInternal = waOpenMode === "internal"
    && waCanInternal
    && waQrActive
    && Boolean(onWaOpenInternal);

  function openPrimaryWhatsApp() {
    if (primaryWaInternal) {
      onWaOpenInternal?.();
      return;
    }
    if (onWaOpenExternal) {
      onWaOpenExternal();
      return;
    }
    const fallback = buildWaLink(n?.phone, {
      text: buildWaMessage({ name: n?.name, segment: n?.segment, city: n?.city }),
    });
    if (fallback && typeof window !== "undefined") {
      window.open(fallback, "_blank", "noopener");
    }
  }
`,
  "ação principal do WhatsApp",
);

page = replaceOnce(
  page,
  '      <div className="kv" style={{ gap: 6 }}>\n',
  '      <div className={"kv" + (showAgenda ? " dn-contact-block" : "")} style={{ gap: 6 }}>\n',
  "classe do bloco de contatos",
);

const phoneStart = '        {n.phone ? (\n';
const phoneEnd = '        ) : fieldPending(false) ? (\n';
const phoneReplacement = `        {n.phone ? (
          showAgenda ? (
            <div className="dn-contact-primary-card">
              <span className="dn-contact-eyebrow">Contato principal</span>
              <a href={\`tel:\${n.phone.replace(/[^\\d+]/g, "")}\`} className="ctx-phone dn-contact-primary">
                <CanalIcon canal="telefone" />
                <TypedText text={formatPhoneDisplay(n.phone)} speed={46} delay={20} />
                {li?.whatsappStatus === "confirmed" && (
                  <span className="dn-contact-verified">
                    <I d={ICONS.check} size={10} /> Verificado
                  </span>
                )}
              </a>
              <div className="dn-contact-primary-actions">
                <button type="button" className="btn-ghost" onClick={openPrimaryWhatsApp}>
                  <WhatsAppMark size={14} /> WhatsApp
                </button>
                <a href={\`tel:\${n.phone.replace(/[^\\d+]/g, "")}\`} className="btn-teal">
                  <CanalIcon canal="telefone" size="sm" /> Ligar
                </a>
              </div>
            </div>
          ) : (
            <a href={\`tel:\${n.phone.replace(/[^\\d+]/g, "")}\`} className="ctx-phone">
              <CanalIcon canal="telefone" /> {n.phone}
            </a>
          )
`;
page = replaceBetween(page, phoneStart, phoneEnd, phoneReplacement, "bloco do telefone principal");

page = replaceOnce(
  page,
  '            <CanalIcon canal="telefone" /> {p}\n',
  '            <CanalIcon canal="telefone" /> {showAgenda ? <TypedText text={formatPhoneDisplay(p)} speed={44} delay={40 + i * 25} /> : p}\n',
  "máscara dos telefones extras",
);

page = replaceOnce(
  page,
  '            <CanalIcon canal="site" /> {n.website}\n',
  '            <CanalIcon canal="site" /> {showAgenda ? <TypedText text={n.website} speed={42} delay={70} /> : n.website}\n',
  "transição do site",
);

page = replaceOnce(
  page,
  '                    <a href={`tel:${n.ownerPhone.replace(/[^\\d+]/g, "")}`} className="ctx-phone ctx-phone--inline">{n.ownerPhone}</a>\n',
  '                    <a href={`tel:${n.ownerPhone.replace(/[^\\d+]/g, "")}`} className="ctx-phone ctx-phone--inline">{showAgenda ? formatPhoneDisplay(n.ownerPhone) : n.ownerPhone}</a>\n',
  "máscara do telefone do dono",
);

page = replaceOnce(
  page,
  '    <div className="dn-root">\n',
  '    <div className={"dn-root" + (showAgenda ? " dn-root--vendas" : "")}>\n',
  "modificador visual do card",
);

const titleStart = "      {/* ── Título com expandir (opt-in) + fechar ─────────────────────── */}\n";
const emptyStart = "      {/* ── Empty state";
const titleReplacement = `      {/* ── Título com expandir (opt-in) + fechar ─────────────────────── */}
      {/* Sem showAgenda o DOM continua idêntico para Atendimento/Leads. */}
      <h3 className={showAgenda ? "dn-root__topbar" : undefined}>
        {title}
        {showAgenda ? (
          <span className="dn-root__top-actions">
            {onDelete && (
              <button
                type="button"
                className={"dn-root__top-action dn-root__top-action--danger" + (deleteArm ? " is-armed" : "")}
                onClick={() => {
                  if (deleteArm) {
                    onDelete?.();
                    setDeleteArm(false);
                  } else {
                    setDeleteArm(true);
                  }
                }}
                aria-label={deleteArm ? "Confirmar exclusão do card" : "Excluir card"}
                title={deleteArm ? "Clique novamente para confirmar" : "Excluir card"}
              >
                <I d={ICONS.trash} size={15} />
              </button>
            )}
            {onExpand && (
              <button type="button" className="dn-root__top-action" onClick={onExpand} aria-label="Abrir cockpit" title="Abrir cockpit">
                <I d={EXPAND_ICON_D} size={14} />
              </button>
            )}
            {onClose && (
              <button type="button" className="dn-root__top-action" onClick={onClose} aria-label="Fechar painel" title="Fechar">
                <I d={ICONS.x} size={14} />
              </button>
            )}
          </span>
        ) : onExpand ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
            <span className="x" onClick={onExpand} role="button" aria-label="Abrir cockpit" title="Abrir cockpit">
              <I d={EXPAND_ICON_D} size={14} />
            </span>
            {onClose && (
              <span className="x" onClick={onClose} role="button" aria-label="Fechar painel">✕</span>
            )}
          </span>
        ) : (
          onClose && (
            <span className="x" onClick={onClose} role="button" aria-label="Fechar painel">✕</span>
          )
        )}
      </h3>

`;
page = replaceBetween(page, titleStart, emptyStart, titleReplacement, "cabeçalho do card");

page = replaceOnce(
  page,
  "                onDelete={onDelete}\n",
  "                onDelete={showAgenda ? undefined : onDelete}\n",
  "mover exclusão para o topo",
);

page = replaceOnce(
  page,
  "                    {detailEngagementMeta && <span className={detailEngagementMeta.className}>{detailEngagementMeta.label}</span>}\n",
  "                    {detailEngagementMeta && !showAgenda && <span className={detailEngagementMeta.className}>{detailEngagementMeta.label}</span>}\n",
  "evitar status duplicado",
);

page = replaceOnce(
  page,
  `            <div className="dn-zone dn-zone--convo">
              <ConversationPanel
`,
  `            <div className="dn-zone dn-zone--convo">
              {showAgenda && (
                <div className="dn-vendas-section-head">
                  <span className="dn-section-head"><I d={ICONS.msg} size={12} /> Conversa</span>
                  {detailEngagementMeta && (
                    <span className={detailEngagementMeta.className}>{detailEngagementMeta.label}</span>
                  )}
                </div>
              )}
              <ConversationPanel
`,
  "cabeçalho da conversa",
);

if (count(page, "<TypedText") < typedBefore) {
  fail("a quantidade de TypedText diminuiu; as transições de escrita não podem ser removidas");
}
if (count(page, "dn-kv-row") < kvBefore) {
  fail("a quantidade de dn-kv-row diminuiu; a costura animada dos campos não pode ser removida");
}
if (!page.includes("REGRA SAGRADA")) {
  fail("o contrato de transições do DetalhesNegocio desapareceu");
}
if (!page.includes(marker) || !page.includes(cssMarker)) {
  fail("o patch terminou sem todos os marcadores obrigatórios");
}

fs.writeFileSync(pagePath, page, "utf8");
console.log(
  `[vendas-detail-card] aplicado com transições preservadas: TypedText ${typedBefore} → ${count(page, "<TypedText")}; dn-kv-row ${kvBefore} → ${count(page, "dn-kv-row")}.`,
);
