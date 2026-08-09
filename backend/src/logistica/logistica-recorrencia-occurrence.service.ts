import { Injectable, Optional } from '@nestjs/common';
import type { ActorKindUserLike } from '../access/actor-kind';
import { PrismaService } from '../prisma/prisma.service';
import { EstoqueService } from '../fiscal/estoque.service';
import { LogisticaOccurrenceService } from './logistica-occurrence.service';
import {
  isoDow,
  LogisticaRecorrenciaService,
  parseDateOrNull,
} from './logistica-recorrencia.service';
import { LogisticaAgendaService } from './logistica-agenda.service';
import {
  enderecoDaFonteMultilocal,
  linhaEnderecoDaFonte,
  resolverCoordenadaMultilocal,
} from './logistica-geo-fonte.util';

/**
 * Mantém todo o CRUD legado de ClienteProduto, mas troca os dois pontos de
 * materialização (preview + gerar-dia) pelo motor de ocorrências. Assim o cron,
 * o painel antigo e o novo HBX Logística compartilham a mesma idempotência:
 * recorrência/data de origem nunca vira uma segunda Entrega silenciosa.
 */
@Injectable()
export class LogisticaRecorrenciaOccurrenceService extends LogisticaRecorrenciaService {
  constructor(
    prisma: PrismaService,
    private readonly occurrences: LogisticaOccurrenceService,
    private readonly agenda: LogisticaAgendaService,
    // 🔴 QUEM RODA DE VERDADE É ESTA CLASSE: o módulo provê
    // `LogisticaRecorrenciaService` com `useExisting` apontando pra cá. Serviço
    // novo que a BASE precisa tem que passar por este construtor também —
    // senão a base recebe `undefined` e o recurso some CALADO (foi o que
    // aconteceu com o saldo de estoque: nenhum erro, campo simplesmente não
    // vinha).
    @Optional() estoque?: EstoqueService,
  ) {
    super(prisma, estoque);
  }

  override async gerarDia(companyId: number, dateInput?: string): Promise<any> {
    if (await this.agenda.isAgendaV2Active(companyId)) {
      return this.agenda.generateDay(companyId, dateInput);
    }
    return this.occurrences.materialize(companyId, {
      operationalDate: dateInput,
      sourceDates: dateInput ? [dateInput] : undefined,
    });
  }

  override async getDiaPreview(
    companyId: number,
    dateInput?: string,
    _actor?: ActorKindUserLike,
  ): Promise<any> {
    if (await this.agenda.isAgendaV2Active(companyId)) {
      const date = parseDateOrNull(dateInput) ?? new Date();
      const preview = await this.agenda.getDayPreview(companyId, isoDow(date), dateInput);
      return {
        date: preview.date,
        clientes: preview.paradas.map((stop: any) => {
          // FIX (25/07) — mesmo bug do toStop (logistica-rota.service.ts): campo a
          // campo podia combinar a lat de uma fonte com a lng de outra.
          // resolverCoordenadaMultilocal escolhe a fonte inteira (local só vale com
          // lat E lng válidos; stop.cliente não tem geoFonte — clienteDto não expõe).
          const coord = resolverCoordenadaMultilocal(stop.local, stop.cliente);
          // 🔴 O ENDEREÇO VAI JUNTO, DA MESMA FONTE DO PINO (09/08, ordem do dono:
          // "celular tem que espelhar os mesmos dados que o desktop tem"). Até aqui
          // a prévia mandava só o APELIDO do local — e apelido é APELIDO: na empresa
          // 41 os 51 clientes de segunda têm apelido vazio e rua preenchida, então a
          // montagem do APK listava 51 cartões com o endereço EM BRANCO enquanto o
          // computador mostrava a rua inteira. Mesma régua da conferência, e por
          // isso a mesma função (nunca a rua de um com o CEP do outro).
          const endereco = enderecoDaFonteMultilocal(stop.local, stop.cliente);
          return {
            customerProfileId: stop.customerProfileId,
            nome: stop.cliente?.nome || 'Cliente',
            localId: stop.localId ?? null,
            localApelido: stop.local?.apelido ?? null,
            endereco: endereco.endereco,
            numero: endereco.numero,
            complemento: endereco.complemento,
            bairro: endereco.bairro,
            cidade: endereco.cidade,
            uf: endereco.uf,
            cep: endereco.cep,
            enderecoLinha: linhaEnderecoDaFonte(endereco),
            lat: coord.lat,
            lng: coord.lng,
            geoFonte: coord.geoFonte,
            itens: (stop.itens ?? []).map((item: any) => ({
              productId: item.productId,
              nome: item.nome || 'Produto',
              qtd: item.qtd,
              valorUnit: Number(item.valorUnit || 0),
            })),
            observacoes: stop.instrucoes ?? null,
            agendaPlanoId: stop.planoEntregaId,
          };
        }),
      };
    }
    return this.occurrences.preview(companyId, dateInput);
  }
}
