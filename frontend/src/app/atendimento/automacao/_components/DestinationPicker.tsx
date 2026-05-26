import type { ConversationDestinationId, ConversationDestinationOption } from "./ConversationBuilder";
import styles from "./ConversationBuilder.module.css";

type Props = {
  value: ConversationDestinationId;
  options: ConversationDestinationOption[];
  disabled?: boolean;
  onChange: (value: ConversationDestinationId) => void;
};

export default function DestinationPicker({ value, options, disabled = false, onChange }: Props) {
  return (
    <label className={styles.destinationPicker}>
      <span>Destino</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as ConversationDestinationId)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
