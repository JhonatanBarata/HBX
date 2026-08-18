import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MessagingModule } from '../messaging/messaging.module';
import { HbxRecoveryModule } from '../hbx-recovery/hbx-recovery.module';
// Crédito da Logística é reservado no início da entrega.
import { CreditsModule } from '../credits/credits.module';
// PR10072026 W1: gate de módulo em rota (ModuleAccessGuard precisa do ModulesService).
import { ModulesAccessModule } from '../modules/modules.module';
import { AuthModule } from '../auth/auth.module';
// LogisticaBaseLimpezaService reusa o cadastro idempotente do NÚCLEO-CRM
// (NucleoCadastroService) pra fundir/limpar conta sem duplicar regra.
import { NucleoModule } from '../nucleo/nucleo.module';
// FISCAL F2a (04/08): FiscalComprovanteEntregaService (exportado pelo FiscalModule)
// gera o comprovante SEM VALOR FISCAL que pega carona no aviso "entregue".
// Sem ciclo: o fiscal não importa logistica.
import { FiscalModule } from '../fiscal/fiscal.module';
// PULSO DO APP (04/08): PulsoAppService (exportado pelo PulsoAppModule) grava a
// tela atual do aparelho de carona no poll dos recados. Sem ciclo: o pulso só
// depende de Prisma.
import { PulsoAppModule } from '../pulso-app/pulso-app.module';
// TUTORIAL OBRIGATÓRIO (09/08): LogisticaTutorialService reusa o carimbo de
// onboarding do UsersService (zero migration). Sem ciclo: users/ não importa logistica.
import { UsersModule } from '../users/users.module';
import { LogisticaService } from './logistica.service';
import { LogisticaRecorrenciaService } from './logistica-recorrencia.service';
import { LogisticaExpurgoService } from './logistica-expurgo.service';
import { LogisticaRotaService } from './logistica-rota.service';
import { LogisticaConferenciaService } from './logistica-conferencia.service';
import { LogisticaCustoPreviewService } from './logistica-custo-preview.service';
import { LogisticaRotaModeloService } from './logistica-rota-modelo.service';
import { LogisticaRotaAvisoService } from './logistica-rota-aviso.service';
import { LogisticaRecadoService } from './logistica-recado.service';
import { LogisticaRecadoMobileController } from './logistica-recado-mobile.controller';
import { LogisticaGeoService } from './logistica-geo.service';
import { LogisticaOsrmService } from './logistica-osrm.service';
import { LogisticaOsrmController } from './logistica-osrm.controller';
import { LogisticaConfigService } from './logistica-config.service';
import { LogisticaRecoveryService } from './logistica-recovery.service';
import { LogisticaCobrancaAvisoService } from './logistica-cobranca-aviso.service';
import { ResumoDiarioService } from './resumo-diario.service';
import { LogisticaPedidoPublicoService } from './logistica-pedido-publico.service';
import { LogisticaController } from './logistica.controller';
import { LogisticaAdminRouteController } from './logistica-admin-route.controller';
import { LogisticaAdminRouteService } from './logistica-admin-route.service';
import { LogisticaAdminRouteViewService } from './logistica-admin-route-view.service';
import { LogisticaMobileController } from './logistica-mobile.controller';
import { LogisticaMobileService } from './logistica-mobile.service';
import { LogisticaPedidoPublicoController } from './logistica-pedido-publico.controller';
import { LogisticaOperacaoService } from './logistica-operacao.service';
import { LogisticaRotaCobrancaService } from './logistica-rota-cobranca.service';
import { LogisticaPasseioService } from './logistica-passeio.service';
import { ProspectorCorredorService } from './prospector-corredor.service';
// PROSPECTOR v2 (12/08) — a 5ª chave: o TIPO que a PESSOA escolheu nesta semana.
import { LogisticaProspectorSemanaService } from './logistica-prospector-semana.service';
import { LogisticaTrackingService } from './logistica-tracking.service';
import { LogisticaTrackingMobileController } from './logistica-tracking-mobile.controller';
import { LogisticaTrackingPublicService } from './logistica-tracking-public.service';
import { LogisticaTrackingPublicController } from './logistica-tracking-public.controller';
import { LogisticaTrackingShareController } from './logistica-tracking-share.controller';
import { LogisticaTrackingBonusService } from './logistica-tracking-bonus.service';
import { LogisticaOfflineController } from './logistica-offline.controller';
import { LogisticaOfflineService } from './logistica-offline.service';
import { LogisticaAgendaController } from './logistica-agenda.controller';
import { LogisticaAgendaService } from './logistica-agenda.service';
import { LogisticaBaseSaudeController } from './logistica-base-saude.controller';
import { LogisticaBaseSaudeService } from './logistica-base-saude.service';
import { LogisticaBaseLimpezaService } from './logistica-base-limpeza.service';
import { LogisticaFechamentoDiaController } from './logistica-fechamento-dia.controller';
import { LogisticaFechamentoDiaService } from './logistica-fechamento-dia.service';
import { LogisticaEstoqueController } from './logistica-estoque.controller';
import { LogisticaNivelMasterController } from './logistica-nivel-master.controller';
import { LogisticaPlanosPublicoController } from './logistica-planos-publico.controller';
import { LogisticaNivelPlanoService } from './logistica-nivel-plano.service';
import { LogisticaEstoqueService } from './logistica-estoque.service';
import { LogisticaTutorialService } from './logistica-tutorial.service';
// VASILHAME (17/08) — casco emprestado por cliente.
import { MailModule } from '../mail/mail.module';
import { LogisticaCadastroMassaService } from './logistica-cadastro-massa.service';
import { LogisticaVasilhameService } from './logistica-vasilhame.service';
// BUSCA DA PARADA AVULSA (12/08, PR12082026-PESQUISA-PAINEL-AVULSA F1):
// `GET /logistica/busca` — 3 fontes locais (clientes fuzzy, CNEFE, RFB), zero
// Nominatim no digitar. Arquivos novos, dono próprio (mesmo precedente F3 de
// 27/07) — zero edição em logistica.service.ts/logistica.controller.ts.
import { LogisticaBuscaController } from './logistica-busca.controller';
import { LogisticaBuscaService } from './logistica-busca.service';
import { LogisticaRotaContinuidadeController } from './logistica-rota-continuidade.controller';
import { LogisticaRotaContinuidadeService } from './logistica-rota-continuidade.service';

/**
 * NÚCLEO-CRM N6 (05/07) — módulo LOGÍSTICA (app de entrega, cliente água).
 *
 * Importa MessagingModule (exporta ConversationsService) para o disparo de
 * WhatsApp "entregue" reusar o caminho BLINDADO da cadência (disjuntor, outbox,
 * 1-número=1-conexão). O disparo (e a cobrança) só rodam com HBX_LOGISTICA_ENABLED
 * ON — default OFF, tudo inerte.
 *
 * LOGÍSTICA-MOBILE M7 (05/07): importa HbxRecoveryModule (exporta HbxRecoveryService)
 * para a cobrança vencida da logística entrar no funil hbx-recovery EXISTENTE via
 * createCustomer (opt-in por LogisticaConfig.moduloRecoveryAtivo, default OFF). Sem
 * ciclo: hbx-recovery NÃO importa logistica.
 *
 * OFFLINE-ROTA: LogisticaOfflineController emite uma cápsula restrita a uma rota
 * ACTIVE/aparelho. A implementação especializada de tracked billing reserva os
 * créditos ao preparar e continua concluindo a claim na transação canônica. O
 * reconciliador devolve claims ainda DEBITED depois que a rota chega a COMPLETED.
 *
 * S2 COBRANÇA-WHATS (11/07): LogisticaCobrancaAvisoService = aviso de cobrança +
 * lembrete de vencimento no zap (Pix copia-e-cola), DORMENTE atrás de
 * HBX_COBRANCA_WHATS_ENABLED (default OFF — scheduler nem arma) + toggle por
 * tenant (LogisticaConfig.cobrancaWhatsAtiva, default false). Provider entra
 * AQUI (regra do S2: nada em app.module.ts); envio só pelo caminho blindado
 * (ConversationsService, já exportado pelo MessagingModule importado acima).
 *
 * S3 RESUMO-DIÁRIO (11/07): ResumoDiarioService = resumo do negócio no WhatsApp
 * do DONO (telefone VERIFICADO do cadastro), 1 msg/empresa/dia na hora escolhida.
 * DORMENTE atrás de HBX_RESUMO_DIARIO_ENABLED (default OFF — scheduler nem arma)
 * + toggle por tenant (LogisticaConfig.resumoDiarioAtivo, default false). Mesmas
 * regras do S2: provider AQUI, envio SÓ pelo caminho blindado.
 *
 * S6 PORTAL-PEDIDO (11/07): LogisticaPedidoPublicoController = rota PÚBLICA
 * /public/pedido/:token (sem JWT — segurança pelo token opaco, molde
 * website-lead-capture). DORMENTE atrás de HBX_PEDIDO_PUBLICO_ENABLED (default
 * OFF — GET/POST respondem 404 seco) + toggle por tenant
 * (LogisticaConfig.pedidoPublicoAtivo, default false). Controller entra AQUI
 * (regra do S6: nada em app.module.ts); pedido vira Entrega 'agendada' — ZERO
 * WhatsApp/cobrança (efeitos continuam só no confirmar, atrás da flag do N6).
 *
 * ADMIN MOBILE (16/07): ocorrência recorrente, data operacional e rota deixam de
 * ser a mesma coisa. O controller expõe Ajustar → Traçar → Começar exclusivamente
 * ao administrador, sem antecipar a futura árvore de roles.
 *
 * UM GERADOR SÓ (F1, 09/08): o adapter LogisticaRecorrenciaOccurrenceService e o
 * motor de ocorrências (LogisticaOccurrenceService) foram APAGADOS. Existiam pra
 * escolher, por flag, entre o gerador legado de `ClienteProduto` e a Agenda V2 —
 * e as 9 empresas de produção estavam todas na V2. `LogisticaRecorrenciaService`
 * voltou a ser um provider comum: ele mantém o CRUD do vínculo e delega
 * gerar-dia/prévia direto pra LogisticaAgendaService.
 *
 * CONTRATO APK (17/07): LogisticaMobileController mantém a rota actor-scoped e
 * entrega ao motorista apenas as instruções de recebimento necessárias. A mesma
 * superfície materializa datas de origem na data operacional escolhida, sem
 * reabrir histórico nem duplicar ocorrência.
 *
 * S4 OSRM-BACKEND (21/07, PR21072026-NAVEGACAO-HBX): LogisticaOsrmController
 * expõe `/logistica/osrm/route|table` como proxy do OSRM público (servidor de
 * DEMONSTRAÇÃO, sem SLA) — cache + rate-limit por empresa em
 * LogisticaOsrmService, stateless (sem Prisma). O app mantém fallback direto
 * pro público em qualquer erro daqui; self-host futuro = trocar OSRM_BASE_URL.
 *
 * S1 MOTOR-COM-CRACHÁ (25/07, PR25072026-ROTA-CONFERIDA): LogisticaRotaService
 * passa a INJETAR LogisticaOsrmService (@Optional — degrada pro degrau 2 sem
 * quebrar se algum teste instanciar o serviço sem ele) como DEGRAU 1 da cadeia
 * proxy→público→Haversine de planRouteByRoads. Mesmo provider desta entrada, só
 * ganhou mais um consumidor dentro do módulo.
 *
 * S3 VALIDADOR-CONFERÊNCIA (25/07, PR25072026-ROTA-CONFERIDA): LogisticaConferenciaService
 * roda o MESMO planRouteByRoads em memória (DRY-RUN ABSOLUTO — Lei nº3: nunca grava
 * rotaOrdem/etaAt, nunca debita crédito) e devolve o semáforo de confiança do pino
 * por parada. Reusa LogisticaConfigService/LogisticaOsrmService já providos aqui;
 * não precisa de novo import de módulo.
 *
 * S6 CRÉDITOS-PREVIEW (25/07, PR25072026-ROTA-CONFERIDA): LogisticaCustoPreviewService
 * é 100% LEITURA (Lei nº3: nenhum wallet.debit) — mostra o que o Iniciar VAI debitar
 * (nível CREDITO) ou o assento que vai gastar (nível com plano) antes do operador
 * apertar o botão. Reusa CreditWalletService/LogisticaConfigService já providos
 * aqui; não precisa de novo import de módulo.
 * ⛔ ROTA v2 (10/08, "PICAR A PONTE"): LogisticaRouteBillingService e a fórmula de
 * blocos (essentialBlocksForDeliveries) morreram nesta onda — plano com nível
 * (BASIC/ADVANCED/FULL) virou rota ILIMITADA (limite de ASSENTO, não de bloco) e
 * CREDITO paga o DIA, não a parada. `LogisticaRotaCobrancaService` é a fonte nova
 * (garantirDiaPago/assertAssentoDoDia/garantirPasseDoDia).
 *
 * S7 SAÚDE-DA-BASE (25/07, PR25072026-ROTA-CONFERIDA): LogisticaBaseSaudeController/
 * Service expõem `/logistica/base-saude` — a MESMA regra da S3 (`conferirParadas`)
 * apontada pro tenant inteiro em vez da rota do dia. Read-only puro (só
 * findMany/groupBy); nenhuma dependência nova de módulo (só PrismaModule, já
 * importado acima).
 *
 * ENTERRAR AS MORTAS (F4, 09/08, PR09082026-ROTA-SEIS-VERBOS): três features
 * publicadas foram APAGADAS depois de medidas em produção — IMPORTAÇÃO
 * (`/logistica/importacao`, 0 lotes desde que nasceu), LEITURA DE ROTA
 * (`/logistica/leitura/*`, 17 sessões e TODAS canceladas, 0 paradas capturadas) e
 * ROTA INDICADA (`/logistica/rota-indicadas/*`, 4 usos na vida). Foram-se os
 * controllers/services/DTOs/testes das três; as telas (web e APK) saíram na
 * mesma onda. NucleoModule continua importado — quem usa NucleoCadastroService
 * agora é LogisticaBaseLimpezaService, não mais a efetivação da importação.
 *
 * F3 FULL-POLIDO (27/07, PR27072026-ROTA-3-NIVEIS): LogisticaTrackingPublicService
 * expõe o link "acompanhe sua entrega" — LogisticaTrackingPublicController é a
 * rota PÚBLICA `/public/tracking/:token` (sem JWT — segurança pelo token
 * ASSINADO, ver logistica-tracking-public.util.ts; DORMENTE sem
 * HBX_LOGISTICA_TRACKING_LINK_SECRET configurado, fail-closed) e
 * LogisticaTrackingShareController é `/logistica/tracking/deliveries/:id/link`
 * + `/routes/:id/share-links` (autenticado, admin, resolve/gera o link pro
 * painel). Arquivos novos, dono próprio (F3) — zero edição em
 * logistica.service.ts/logistica-config.service.ts/logistica.controller.ts
 * (território do worker F2 rodando em paralelo nesta mesma frente).
 *
 * F2 ADVANCED-COMPLETO (27/07, PR27072026-ROTA-3-NIVEIS): LogisticaEstoqueController/
 * Service expõem `/logistica/estoque/carga` — conferência de caminhão do dia
 * (carregou/vendeu/voltou), arquivo novo, dono próprio (F2). Recurso ADVANCED+
 * (gate de nível no serviço). A parada amarela de devedor (irmã desta mesma
 * frente) NÃO tem arquivo próprio — é `resolverDevedorNaRota` dentro de
 * LogisticaService (fonte única com listRota) + o filtro em
 * LogisticaAdminRouteService#prepare.
 *
 * PÁGINA DO SITE (28/07, mesma frente): LogisticaPlanosPublicoController é a
 * rota PÚBLICA `/public/logistica/planos` (sem JWT, sem token — é tabela de
 * preço de anúncio) que alimenta a vitrine `/rota` do site com o MESMO catálogo
 * que o Master edita. Sem ela a página teria preço escrito à mão e passaria a
 * mentir no dia em que o dono mudasse o valor.
 *
 * TUTORIAL OBRIGATÓRIO (09/08, CONTRATO-TUTOR): LogisticaTutorialService é o único
 * provider novo desta frente — endereço PRÓPRIO (`/logistica/tutorial*`), zero
 * migration, importa UsersModule só pra reusar o carimbo de onboarding por usuário
 * que já existia (UsersService#stampOnboardingEvent/getOnboardingEvents).
 */
@Module({
  imports: [PrismaModule, MessagingModule, HbxRecoveryModule, CreditsModule, ModulesAccessModule, AuthModule, NucleoModule, FiscalModule, PulsoAppModule, UsersModule, MailModule],
  controllers: [
    LogisticaController,
    LogisticaRecadoMobileController,
    LogisticaAdminRouteController,
    LogisticaMobileController,
    LogisticaPedidoPublicoController,
    LogisticaTrackingMobileController,
    LogisticaTrackingPublicController,
    LogisticaTrackingShareController,
    LogisticaOfflineController,
    LogisticaOsrmController,
    LogisticaAgendaController,
    LogisticaBaseSaudeController,
    LogisticaFechamentoDiaController,
    LogisticaEstoqueController,
    LogisticaNivelMasterController,
    LogisticaPlanosPublicoController,
    LogisticaBuscaController,
    LogisticaRotaContinuidadeController,
  ],
  providers: [
    LogisticaService,
    LogisticaRecorrenciaService,
    // ⛔ A LEI DO DESAPARECER (10/08): o não-processado expira sozinho. Sem chave
    // e sem opt-in por empresa — ver o cabeçalho do serviço pro porquê.
    LogisticaExpurgoService,
    LogisticaAdminRouteService,
    LogisticaAdminRouteViewService,
    LogisticaMobileService,
    LogisticaRotaService,
    LogisticaConferenciaService,
    LogisticaCustoPreviewService,
    LogisticaRotaModeloService,
    LogisticaRotaAvisoService,
    LogisticaRecadoService,
    LogisticaGeoService,
    LogisticaOsrmService,
    LogisticaConfigService,
    LogisticaNivelPlanoService,
    LogisticaRecoveryService,
    LogisticaCobrancaAvisoService,
    ResumoDiarioService,
    LogisticaPedidoPublicoService,
    LogisticaOperacaoService,
    LogisticaRotaCobrancaService,
    LogisticaPasseioService,
    ProspectorCorredorService,
    LogisticaProspectorSemanaService,
    LogisticaTrackingService,
    LogisticaTrackingPublicService,
    LogisticaOfflineService,
    LogisticaTrackingBonusService,
    LogisticaAgendaService,
    LogisticaBaseSaudeService,
    LogisticaBaseLimpezaService,
    LogisticaFechamentoDiaService,
    LogisticaEstoqueService,
    LogisticaTutorialService,
    LogisticaBuscaService,
    LogisticaRotaContinuidadeService,
    // VASILHAME (17/08) — casco emprestado por cliente (garrafão/botijão/engradado).
    LogisticaVasilhameService,
    LogisticaCadastroMassaService,
  ],
  exports: [
    LogisticaService,
    LogisticaRecorrenciaService,
    LogisticaMobileService,
    LogisticaRotaService,
    LogisticaConfigService,
    LogisticaNivelPlanoService,
    LogisticaOperacaoService,
    LogisticaRecoveryService,
    LogisticaRotaCobrancaService,
    LogisticaTrackingService,
    LogisticaTrackingBonusService,
    LogisticaAgendaService,
  ],
})
export class LogisticaModule {}
