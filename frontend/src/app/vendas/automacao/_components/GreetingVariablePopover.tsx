import type { AtendimentoBotConfig } from "../../../atendimento/inbox-model";
import styles from "./ConversationBuilder.module.css";

type Props = {
  open: boolean;
  config: AtendimentoBotConfig;
  onChange: (config: AtendimentoBotConfig) => void;
  onClose: () => void;
};

const DEFAULT_GREETING = {
  timezone: "America/Sao_Paulo",
  morning: "Bom dia",
  afternoon: "Boa tarde",
  night: "Boa noite",
  morningStartHour: 3,
  afternoonStartHour: 12,
  nightStartHour: 18,
};

function clampHour(value: unknown, fallback: number) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(23, parsed));
}

export function resolveGreetingPreview(
  config: AtendimentoBotConfig,
  period: "morning" | "afternoon" | "night",
) {
  const greeting = { ...DEFAULT_GREETING, ...(config.smartVariables?.greeting || {}) };
  if (period === "afternoon") return greeting.afternoon;
  if (period === "night") return greeting.night;
  return greeting.morning;
}

export default function GreetingVariablePopover({ open, config, onChange, onClose }: Props) {
  if (!open) return null;

  const greeting = { ...DEFAULT_GREETING, ...(config.smartVariables?.greeting || {}) };
  const updateGreeting = (patch: Partial<typeof DEFAULT_GREETING>) => {
    onChange({
      ...config,
      smartVariables: {
        ...(config.smartVariables || {}),
        greeting: {
          ...greeting,
          ...patch,
        },
      },
    });
  };

  const resetDefault = () => {
    onChange({
      ...config,
      smartVariables: {
        ...(config.smartVariables || {}),
        greeting: DEFAULT_GREETING,
      },
    });
  };

  return (
    <div className={styles.greetingPopover}>
      <div className={styles.popoverHeader}>
        <div>
          <span className={styles.eyebrow}>Cumprimentacao</span>
          <strong>Variavel inteligente</strong>
        </div>
        <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Fechar">
          x
        </button>
      </div>

      <div className={styles.greetingModes}>
        <button type="button" onClick={resetDefault}>
          <strong>Padrao</strong>
          <span>03:00 / 12:00 / 18:00</span>
        </button>
        <span>
          <strong>Personalizado</strong>
          <small>Edite textos e cortes.</small>
        </span>
      </div>

      <div className={styles.greetingForm}>
        <label>
          manha
          <input value={greeting.morning} onChange={(event) => updateGreeting({ morning: event.target.value })} />
        </label>
        <label>
          tarde
          <input value={greeting.afternoon} onChange={(event) => updateGreeting({ afternoon: event.target.value })} />
        </label>
        <label>
          noite
          <input value={greeting.night} onChange={(event) => updateGreeting({ night: event.target.value })} />
        </label>
        <label>
          corte manha
          <input
            type="number"
            min={0}
            max={23}
            value={greeting.morningStartHour}
            onChange={(event) => updateGreeting({ morningStartHour: clampHour(event.target.value, 3) })}
          />
        </label>
        <label>
          corte tarde
          <input
            type="number"
            min={0}
            max={23}
            value={greeting.afternoonStartHour}
            onChange={(event) => updateGreeting({ afternoonStartHour: clampHour(event.target.value, 12) })}
          />
        </label>
        <label>
          corte noite
          <input
            type="number"
            min={0}
            max={23}
            value={greeting.nightStartHour}
            onChange={(event) => updateGreeting({ nightStartHour: clampHour(event.target.value, 18) })}
          />
        </label>
      </div>
    </div>
  );
}
