import { redirect } from "next/navigation";

// /mobile/entry — CARREGADOR DE TICKET, não é mais uma tela.
//
// O backend monta `entryUrl = <site>/mobile/entry?ticket=…` (mobile-device.
// service) e o APLICATIVO só lê o parâmetro `ticket` dessa URL: quem abre a
// sessão é o NativeApiClient, direto no endpoint. Nada aqui é renderizado
// dentro do app.
//
// Até 06/08 esta rota era uma tela que trocava o ticket por sessão no
// navegador e caía no /entrega — o app de celular que rodava no NAVEGADOR.
// Ele foi apagado (lei do dono: no telefone quem trabalha é o aplicativo).
// O arquivo continua existindo, mudo, por UM motivo: instalação antiga em
// campo que por acaso abra essa URL no navegador encontra a tela de baixar o
// aplicativo — nunca um 404 branco no meio da rota.
export default function MobileEntryPage() {
  redirect("/baixar");
}
