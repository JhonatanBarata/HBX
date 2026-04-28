import styles from "./ConversationBuilder.module.css";

export type BuilderVariable = {
  token: string;
  label: string;
  smart?: boolean;
};

type Props = {
  disabled?: boolean;
  onInsert: (token: string) => void;
  onConfigureGreeting: () => void;
};

export const BUILDER_VARIABLES: BuilderVariable[] = [
  { token: "cumprimentacao", label: "Cumprimentacao", smart: true },
  { token: "cliente", label: "Cliente" },
  { token: "empresa", label: "Empresa" },
  { token: "funcionario", label: "Funcionario" },
  { token: "valor_formatado", label: "Valor em aberto" },
  { token: "agenda_nome", label: "Agenda" },
  { token: "agenda_slots", label: "Horarios" },
];

export function getVariableLabel(token: string) {
  return BUILDER_VARIABLES.find((variable) => variable.token === token)?.label || token;
}

export default function VariableChipPicker({ disabled = false, onInsert, onConfigureGreeting }: Props) {
  return (
    <div className={styles.variableChips} aria-label="Variaveis disponiveis">
      {BUILDER_VARIABLES.map((variable) => (
        <button
          key={variable.token}
          type="button"
          className={styles.variableChip}
          data-smart={variable.smart ? "true" : "false"}
          disabled={disabled}
          onClick={() => {
            onInsert(variable.token);
            if (variable.smart) onConfigureGreeting();
          }}
        >
          {variable.label}
        </button>
      ))}
    </div>
  );
}
