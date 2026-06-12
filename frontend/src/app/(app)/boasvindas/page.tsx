import { redirect } from "next/navigation";

// O backend manda recém-confirmado para /boasvindas; a recepção canônica é
// o TUTORIAL (List → Lead → Full, ordem do dono 12/06/2026).
export default function BoasvindasAlias() {
  redirect("/tutorial");
}
