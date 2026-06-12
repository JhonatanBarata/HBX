import { redirect } from "next/navigation";

// Alias de transição: variação histórica de /pre-checkout (mesma nota).
export default function PrecheckoutAlias() {
  redirect("/dashboard");
}
