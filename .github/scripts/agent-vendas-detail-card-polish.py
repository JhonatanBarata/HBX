from pathlib import Path
from textwrap import dedent, indent

PAGE_PATH = Path("frontend/src/components/hbx/detalhes-negocio.tsx")
CSS_PATH = Path("frontend/src/app/hbx-theme/screens.css")

page = PAGE_PATH.read_text(encoding="utf-8")
css = CSS_PATH.read_text(encoding="utf-8")
typed_before = page.count("<TypedText")
kv_before = page.count("dn-kv-row")

def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: esperado 1 trecho, encontrado {count}")
    return text.replace(old, new, 1)

def block(raw: str, spaces: int) -> str:
    return indent(dedent(raw).strip("\n"), " " * spaces)

if "export function formatPhoneDisplay" in page:
    raise RuntimeError("O helper de máscara já existe; interrompendo para não duplicar.")

phone_helper = block(r'''
export function formatPhoneDisplay(value: string | null | undefined): string {
  const original = String(value || "").trim();
  if (!original) return "—";

  let digits = original.replace(/\D/g, "");
  let country = "";
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    country = "+55 ";
    digits = digits.slice(2);
  }

  if (digits.length === 11) {
    return `${country}(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${country}(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return original;
}

''', 0)
page = replace_once(
    page,
    "function fmtSourceLabel(sourceType?: string | null, primarySource?: string | null) {",
    phone_helper + "function fmtSourceLabel(sourceType?: string | null, primarySource?: string | null) {",
    "inserir formatPhoneDisplay",
)

state_old = '  const [semInteresseOpen, setSemInteresseOpen] = useState(false);\n'
state_new = block(r'''
const [semInteresseOpen, setSemInteresseOpen] = useState(false);
const [deleteArm, setDeleteArm] = useState(false);
useEffect(() => {
  if (!deleteArm) return;
  const timer = window.setTimeout(() => setDeleteArm(false), 3000);
  return () => window.clearTimeout(timer);
}, [deleteArm]);
''', 2) + "\n"
page = replace_once(page, state_old, state_new, "estado de confirmação da exclusão")

page = replace_once(
    page,
    "  const ent = useEntitlements();\n",
    "  const ent = useEntitlements();\n  const waOpenMode = useWaOpenMode();\n",
    "modo de abertura do WhatsApp",
)

field_old = "  const fieldPending = (has: boolean) => isEnriching && !has;\n"
field_new = block(r'''
const fieldPending = (has: boolean) => isEnriching && !has;
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
''', 2) + "\n"
page = replace_once(page, field_old, field_new, "ação principal do WhatsApp")

page = replace_once(
    page,
    '      <div className="kv" style={{ gap: 6 }}>\n',
    '      <div className={"kv" + (showAgenda ? " dn-contact-block" : "")} style={{ gap: 6 }}>\n',
    "classe do bloco de contatos",
)

phone_old = block(r'''
{n.phone ? (
  <a href={`tel:${n.phone.replace(/[^\d+]/g, "")}`} className="ctx-phone">
    <CanalIcon canal="telefone" /> {n.phone}
  </a>
) : fieldPending(false) ? (
''', 8)
phone_new = block(r'''
{n.phone ? (
  showAgenda ? (
    <div className="dn-contact-primary-card">
      <span className="dn-contact-eyebrow">Contato principal</span>
      <a href={`tel:${n.phone.replace(/[^\d+]/g, "")}`} className="ctx-phone dn-contact-primary">
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
        <a href={`tel:${n.phone.replace(/[^\d+]/g, "")}`} className="btn-teal">
          <CanalIcon canal="telefone" size="sm" /> Ligar
        </a>
      </div>
    </div>
  ) : (
    <a href={`tel:${n.phone.replace(/[^\d+]/g, "")}`} className="ctx-phone">
      <CanalIcon canal="telefone" /> {n.phone}
    </a>
  )
) : fieldPending(false) ? (
''', 8)
page = replace_once(page, phone_old, phone_new, "bloco do telefone principal")

page = replace_once(
    page,
    '            <CanalIcon canal="telefone" /> {p}\n',
    '            <CanalIcon canal="telefone" /> {showAgenda ? <TypedText text={formatPhoneDisplay(p)} speed={44} delay={40 + i * 25} /> : p}\n',
    "máscara dos telefones extras",
)

page = replace_once(
    page,
    '            <CanalIcon canal="site" /> {n.website}\n',
    '            <CanalIcon canal="site" /> {showAgenda ? <TypedText text={n.website} speed={42} delay={70} /> : n.website}\n',
    "transição do site",
)

page = replace_once(
    page,
    '                    <a href={`tel:${n.ownerPhone.replace(/[^\\d+]/g, "")}`} className="ctx-phone ctx-phone--inline">{n.ownerPhone}</a>\n',
    '                    <a href={`tel:${n.ownerPhone.replace(/[^\\d+]/g, "")}`} className="ctx-phone ctx-phone--inline">{showAgenda ? formatPhoneDisplay(n.ownerPhone) : n.ownerPhone}</a>\n',
    "máscara do telefone do dono",
)

page = replace_once(
    page,
    '    <div className="dn-root">\n',
    '    <div className={"dn-root" + (showAgenda ? " dn-root--vendas" : "")}>\n',
    "modificador visual do card",
)

header_old = block(r'''
<h3>
  {title}
  {onExpand ? (
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
''', 6)
header_new = block(r'''
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
              onDelete();
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
''', 6)
page = replace_once(page, header_old, header_new, "cabeçalho do card")

page = replace_once(
    page,
    "                onDelete={onDelete}\n",
    "                onDelete={showAgenda ? undefined : onDelete}\n",
    "mover exclusão para o topo",
)

page = replace_once(
    page,
    "                    {detailEngagementMeta && <span className={detailEngagementMeta.className}>{detailEngagementMeta.label}</span>}\n",
    "                    {detailEngagementMeta && !showAgenda && <span className={detailEngagementMeta.className}>{detailEngagementMeta.label}</span>}\n",
    "evitar status duplicado",
)

convo_old = block(r'''
<div className="dn-zone dn-zone--convo">
  <ConversationPanel
''', 12)
convo_new = block(r'''
<div className="dn-zone dn-zone--convo">
  {showAgenda && (
    <div className="dn-vendas-section-head">
      <span className="dn-section-head"><I d={ICONS.msg} size={12} /> Conversa</span>
      {detailEngagementMeta && (
        <span className={detailEngagementMeta.className}>{detailEngagementMeta.label}</span>
      )}
    </div>
  )}
  <ConversationPanel
''', 12)
page = replace_once(page, convo_old, convo_new, "cabeçalho da conversa")

if page.count("<TypedText") < typed_before:
    raise RuntimeError("A quantidade de TypedText diminuiu; as transições de escrita não podem ser removidas.")
if page.count("dn-kv-row") < kv_before:
    raise RuntimeError("A quantidade de dn-kv-row diminuiu; a costura animada dos campos não pode ser removida.")
if "REGRA SAGRADA" not in page:
    raise RuntimeError("O contrato de transições do DetalhesNegocio desapareceu.")

css_marker = "/* ── VENDAS DETAIL POLISH — preview aprovado, sem tocar nas transições (15/07/2026) ── */"
if css_marker in css:
    raise RuntimeError("O bloco visual já existe; interrompendo para não duplicar.")

css_block = dedent(r'''

/* ── VENDAS DETAIL POLISH — preview aprovado, sem tocar nas transições (15/07/2026) ── */
.dn-root--vendas {
  gap: 0;
  padding: 0;
  overflow: hidden;
  background:
    radial-gradient(120% 72% at 100% 0%, color-mix(in srgb, var(--hbx-brand) 8%, transparent), transparent 58%),
    var(--hbx-surface);
}

.dn-root--vendas > .dn-root__topbar {
  position: sticky;
  top: 0;
  z-index: 6;
  min-height: 46px;
  margin: 0;
  padding: 0 14px;
  border-bottom: 1px solid var(--border-hairline);
  background: color-mix(in srgb, var(--hbx-surface) 94%, transparent);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}

.dn-root__top-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.dn-root__top-action {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition:
    color var(--motion-fast),
    background var(--motion-fast),
    transform var(--motion-fast);
}

.dn-root__top-action:hover {
  color: var(--hbx-brand-strong);
  background: var(--hbx-brand-soft);
  transform: translateY(-1px);
}

.dn-root__top-action--danger:hover,
.dn-root__top-action--danger.is-armed {
  color: var(--hbx-danger);
  background: color-mix(in srgb, var(--hbx-danger) 10%, transparent);
}

.dn-root--vendas .dn-zone--1 {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 14px 12px 0;
  border: 0;
}

.dn-root--vendas .dn-header {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(115% 95% at 100% 0%, color-mix(in srgb, var(--hbx-brand) 8%, transparent), transparent 58%),
    var(--hbx-surface);
  box-shadow: var(--shadow-xs);
}

.dn-root--vendas .ctx-hero {
  align-items: flex-start;
  gap: 12px;
}

.dn-root--vendas .ctx-hero .company {
  font-size: 1rem;
  line-height: 1.14;
  letter-spacing: -0.02em;
  white-space: normal;
  overflow-wrap: anywhere;
}

.dn-root--vendas .ctx-hero .sub--seg {
  margin-top: 2px;
  color: var(--text-body);
  font-weight: 700;
}

.dn-root--vendas .ctx-hero .sub--loc {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin-top: 2px;
  line-height: 1.4;
}

.dn-root--vendas .ctx-tags {
  gap: 5px;
  margin-top: 6px;
}

.dn-root--vendas .dn-channels-row {
  gap: 7px;
  padding-top: 1px;
  flex-wrap: wrap;
}

.dn-root--vendas .dn-channels-row > a,
.dn-root--vendas .dn-channels-row > span,
.dn-root--vendas .dn-channels-row > button {
  width: 32px;
  height: 32px;
  border-radius: 10px;
}

.dn-root--vendas .dn-wa-verified {
  width: fit-content;
  padding: 3px 9px;
  border-radius: var(--radius-pill);
  font-size: 0.58rem;
  letter-spacing: 0.01em;
}

.dn-root--vendas .dn-zone1-intel {
  display: grid;
  grid-template-columns: minmax(118px, 0.82fr) minmax(0, 1.18fr);
  gap: 10px;
  align-items: stretch;
}

.dn-root--vendas .dn-zone1-intel > :only-child {
  grid-column: 1 / -1;
}

.dn-root--vendas .dn-score-inline,
.dn-root--vendas .dn-opportunity-teaser {
  height: 100%;
  min-width: 0;
  margin: 0;
  padding: 11px;
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-lg);
  background: var(--hbx-surface);
  box-shadow: var(--shadow-xs);
}

.dn-root--vendas .dn-score-inline {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 9px;
}

.dn-root--vendas .dn-score-inline-label {
  font-size: 0.62rem;
  line-height: 1.35;
}

.dn-root--vendas .dn-opportunity-teaser {
  align-content: center;
  background:
    radial-gradient(100% 120% at 0 0, color-mix(in srgb, var(--hbx-warning) 12%, transparent), transparent 58%),
    var(--hbx-surface);
}

.dn-root--vendas .dn-opportunity-teaser__text {
  line-height: 1.45;
}

.dn-root--vendas .dn-contact-block {
  display: grid;
  gap: 8px !important;
  min-width: 0;
}

.dn-root--vendas .dn-contact-primary-card {
  display: grid;
  gap: 9px;
  padding: 12px;
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(95% 120% at 100% 0, color-mix(in srgb, var(--hbx-info) 10%, transparent), transparent 58%),
    var(--hbx-surface-soft);
  box-shadow: var(--shadow-xs);
}

.dn-root--vendas .dn-contact-eyebrow {
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.dn-root--vendas .dn-contact-primary {
  min-height: 42px;
  min-width: 0;
  padding: 0 11px;
  border: 1px solid var(--hbx-brand);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--hbx-brand) 7%, var(--hbx-surface));
  color: var(--hbx-brand-strong);
  box-shadow: none;
  font-family: var(--font-mono);
  font-size: 0.92rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  overflow: hidden;
}

.dn-root--vendas .dn-contact-primary > .dn-typed {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dn-root--vendas .dn-contact-verified {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  color: var(--hbx-success);
  font-family: var(--font-body);
  font-size: 0.56rem;
  font-weight: 800;
  white-space: nowrap;
}

.dn-root--vendas .dn-contact-primary-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}

.dn-root--vendas .dn-contact-primary-actions .btn-ghost,
.dn-root--vendas .dn-contact-primary-actions .btn-teal {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border-radius: var(--radius-sm);
  font-size: 0.7rem;
  text-decoration: none;
}

.dn-root--vendas .dn-contact-block > .ctx-phone--inline,
.dn-root--vendas .dn-contact-block > .ctx-phone--site {
  min-height: 38px;
  min-width: 0;
  padding: 0 11px;
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-md);
  background: var(--hbx-surface);
  box-shadow: none;
  font-size: 0.66rem;
  overflow: hidden;
}

.dn-root--vendas .dn-contact-block > .ctx-phone--site > .dn-typed {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dn-root--vendas .dn-contact-block > .row.dn-kv-row {
  min-width: 0;
  padding: 9px 11px;
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-md);
  background: var(--hbx-surface);
}

.dn-root--vendas .dn-contact-block > .row.dn-kv-row .v {
  min-width: 0;
  overflow-wrap: anywhere;
}

.dn-root--vendas .dn-zone--convo,
.dn-root--vendas .dn-zone--agenda,
.dn-root--vendas .dn-zone--2 {
  margin-right: 12px;
  margin-left: 12px;
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-lg);
  background: var(--hbx-surface);
  box-shadow: var(--shadow-xs);
}

.dn-root--vendas .dn-zone--convo {
  margin-top: 12px;
  padding: 0;
  overflow: hidden;
}

.dn-root--vendas .dn-vendas-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 42px;
  padding: 0 12px;
  border-bottom: 1px solid var(--border-hairline);
}

.dn-root--vendas .dn-vendas-section-head .dn-section-head {
  margin: 0;
}

.dn-root--vendas .dn-convo {
  border: 0;
  border-radius: 0;
  background: transparent;
}

.dn-root--vendas .dn-convo__tabs {
  padding: 6px 10px;
}

.dn-root--vendas .dn-convo__hint {
  line-height: 1.45;
}

.dn-root--vendas .dn-convo__body {
  min-height: 118px;
  max-height: 360px;
  padding: 14px;
  gap: 10px;
  align-content: center;
  text-align: center;
}

.dn-root--vendas .dn-convo__body:has(.msgs) {
  align-content: stretch;
  text-align: left;
}

.dn-root--vendas .dn-convo__body > .btn-teal {
  margin: 0 auto !important;
}

.dn-root--vendas .dn-convo .msgs {
  min-height: 118px;
  max-height: 245px;
}

.dn-root--vendas .dn-zone--agenda {
  margin-top: 0;
  margin-bottom: 12px;
  padding: 0;
  overflow: hidden;
}

.dn-root--vendas .dn-agenda {
  gap: 0;
}

.dn-root--vendas .dn-agenda__head {
  min-height: 42px;
  padding: 0 12px;
  border-bottom: 1px solid var(--border-hairline);
}

.dn-root--vendas .dn-agenda > .muted-note,
.dn-root--vendas .dn-agenda > .ctx-msg {
  margin: 0;
  padding: 12px;
}

.dn-root--vendas .dn-agenda__form,
.dn-root--vendas .dn-agenda__list {
  margin: 0;
  padding: 12px;
}

.dn-root--vendas .dn-zone-sep {
  margin: 0 12px;
}

.dn-root--vendas .dn-zone--2 {
  margin-top: 0;
  margin-bottom: 14px;
  padding: 12px;
}

.dn-root--vendas .dn-zone--2 .kv {
  gap: 0;
}

.dn-root--vendas .dn-expand-btn {
  margin-right: 12px;
  margin-left: 12px;
}

.dn-root--vendas > .sep {
  margin-right: 12px;
  margin-left: 12px;
}

@media (max-width: 380px) {
  .dn-root--vendas .dn-zone1-intel {
    grid-template-columns: 1fr;
  }

  .dn-root--vendas .dn-zone1-intel > * {
    grid-column: 1;
  }

  .dn-root--vendas .dn-contact-primary {
    font-size: 0.82rem;
  }

  .dn-root--vendas .dn-contact-verified {
    font-size: 0;
  }

  .dn-root--vendas .dn-contact-verified::after {
    content: "OK";
    font-size: 0.56rem;
  }
}
''')

css += css_block
PAGE_PATH.write_text(page, encoding="utf-8")
CSS_PATH.write_text(css, encoding="utf-8")
