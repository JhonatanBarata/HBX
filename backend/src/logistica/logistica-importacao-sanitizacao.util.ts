// F4 (27/07, PR27072026-ROTA-3-NIVEIS) — a régua VERDE/VERMELHO da quarentena de
// importação. REUSA o sanitizador CNEFE que já existe em produção (não duplica a
// lógica de resolução de pino): mesmas funções de logistica-conferencia.service.ts
// (alvoCuraCnefe/problemaDoCadastro), aqui adaptadas a um endereço já ACHATADO —
// um item de importação não tem `local`/`customerProfile` (ainda não existe conta),
// só os campos crus extraídos pelo parser.
//
// DUAS PASSADAS, mesmo espírito do sanitizador em produção (LogisticaConferenciaService):
//  1. classificarCampoBasico — BARATA (zero rede/banco), roda no UPLOAD inteiro (uma
//     planilha de 245 linhas não pode esperar 245 consultas CNEFE só pra aparecer na
//     tela). Item com campo óbvio faltando já nasce VERMELHO; o resto nasce PENDENTE.
//  2. sanitizarEndereco — CARA (consulta a base CNEFE), roda em LOTE com orçamento
//     (ver logistica-importacao.service.ts#sanitizarLote, mesmo padrão LOTE/orçamento/
//     restantes de LogisticaConferenciaService#sanitizar) só nos itens PENDENTE.
//
// Lei nº1 do freio (nucleo-geo.util.ts) vale aqui igual: pino errado é PIOR que pino
// vazio. Um item só vira VERDE quando o CNEFE PROVA a porta — nunca chute/geocode.

import { extrairNumeroPorta } from '../nucleo/cnefe-resolver.util';
import { logradouroDoCadastro, normalizarCep, temBairroNoCadastro } from './logistica-cep.util';
// resolverCuraCnefe/AlvoCuraCnefe vivem em logistica-conferencia.service.ts (o
// "cérebro" do sanitizador em produção) — importados por LEITURA (nunca editamos
// esse arquivo; é o mesmo motor que roda a conferência de rota e o pop-up
// "Correção em massa" do Gerenciador).
import { resolverCuraCnefe, type AlvoCuraCnefe } from './logistica-conferencia.service';

export interface EnderecoImportado {
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
}

export type StatusSanitizacao = 'VERDE' | 'VERMELHO' | 'PENDENTE';

export interface ResultadoSanitizacao {
  status: StatusSanitizacao;
  motivo: string | null;
  lat: number | null;
  lng: number | null;
  geoFonte: string | null;
  cepDescoberto: string | null;
}

const CAMPO_VAZIO: Omit<ResultadoSanitizacao, 'status' | 'motivo'> = {
  lat: null, lng: null, geoFonte: null, cepDescoberto: null,
};

/**
 * Diagnóstico do campo que falta, MESMA ORDEM de
 * logistica-conferencia.service.ts#problemaDoCadastro (número → rua → cidade → UF)
 * — a frase é o que o dono digita, não o nome da regra. null = campos básicos OK
 * (só falta rodar o CNEFE pra confirmar o pino).
 */
export function diagnosticoCampoFaltante(e: EnderecoImportado): string | null {
  if (extrairNumeroPorta({ numero: e.numero, endereco: e.endereco }) == null) return 'Falta o número da casa';
  if (logradouroDoCadastro(e.endereco).length < 3) return 'Falta a rua';
  if (String(e.cidade ?? '').trim().length < 3) return 'Falta a cidade';
  if (!/^[A-Za-z]{2}$/.test(String(e.uf ?? '').trim())) return 'Falta o estado (UF)';
  return null;
}

/**
 * Passada BARATA (zero rede/banco) — roda pra planilha/texto inteiro no upload.
 * VERMELHO só quando falta um campo ÓBVIO (nada de CNEFE ainda); PENDENTE = candidato
 * a VERDE, aguardando a passada cara (sanitizarEndereco/sanitizarLote).
 */
export function classificarCampoBasico(e: EnderecoImportado): { status: 'VERMELHO' | 'PENDENTE'; motivo: string | null } {
  if (!String(e.endereco ?? '').trim() && !normalizarCep(e.cep)) {
    return { status: 'VERMELHO', motivo: 'Falta endereço' };
  }
  const faltante = diagnosticoCampoFaltante(e);
  if (faltante) return { status: 'VERMELHO', motivo: faltante };
  return { status: 'PENDENTE', motivo: null };
}

/**
 * Passada CARA — resolve o pino contra a base CNEFE (mesmo motor de
 * resolverCuraCnefe usado pela conferência/sanitizador em produção). Só vale a pena
 * chamar em item já classificado PENDENTE pela passada barata acima (chamar direto
 * também funciona — ela reexecuta a checagem barata primeiro — mas gasta rede à toa
 * num item que já era VERMELHO óbvio).
 */
export async function sanitizarEndereco(
  e: EnderecoImportado,
  opts?: { queryTimeoutMs?: number },
): Promise<ResultadoSanitizacao> {
  const basico = classificarCampoBasico(e);
  if (basico.status === 'VERMELHO') {
    return { status: 'VERMELHO', motivo: basico.motivo, ...CAMPO_VAZIO };
  }

  const numero = extrairNumeroPorta({ numero: e.numero, endereco: e.endereco });
  const cep = normalizarCep(e.cep);
  // Sem CEP, resolverCuraCnefe SÓ tenta quando há bairro pra desempatar trecho de rua
  // comprida (ver o comentário "ESCOPO" em cnefe-resolver.util.ts) — checa ANTES de
  // gastar a chamada, pra devolver o motivo CERTO em vez do genérico "não achado".
  if (!cep && !temBairroNoCadastro({ endereco: e.endereco, bairro: e.bairro })) {
    return {
      status: 'VERMELHO',
      motivo: 'Falta o bairro (sem CEP, precisa do bairro pra achar a rua certa)',
      ...CAMPO_VAZIO,
    };
  }

  const alvo: AlvoCuraCnefe = { tipo: 'perfil', cep, numero: numero as number, endereco: e.endereco, bairro: e.bairro, cidade: e.cidade, uf: e.uf };
  const cura = await resolverCuraCnefe(alvo, opts);
  if (!cura || !cura.pino) {
    return { status: 'VERMELHO', motivo: 'Endereço não achado na base', ...CAMPO_VAZIO, cepDescoberto: cura?.cepDescoberto ?? null };
  }
  return {
    status: 'VERDE',
    motivo: null,
    lat: cura.pino.lat,
    lng: cura.pino.lng,
    geoFonte: 'cnefe',
    cepDescoberto: cura.cepDescoberto,
  };
}
