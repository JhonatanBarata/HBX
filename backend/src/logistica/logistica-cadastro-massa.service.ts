import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { MailService, type MailAttachment } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * CADASTRO EM MASSA POR FOTO (17/08/2026).
 *
 * A tela "você ainda não tem clientes" (a saída da demonstração no app do
 * entregador) oferece duas portas: cadastrar na mão, ou mandar uma foto da
 * lista — caderno, planilha, papel, print do WhatsApp — pra HBX digitar.
 * Isto é a segunda porta.
 *
 * 🔴 POR QUE NÃO EXISTE TABELA NOVA AQUI. O pedido tem UM leitor (a HBX) e um
 * ciclo de vida de 24 h; guardá-lo numa tabela criaria migration, tela de
 * gestão, política de retenção e um lugar a mais onde uma foto de dado de
 * cliente fica esquecida. O canal de destino já existe e já é lido todo dia —
 * é o mesmo `ADMIN_SUPPORT_EMAIL` que o financeiro usa. O anexo vai junto e o
 * arquivo NUNCA toca o disco do servidor: chega em memória e sai no e-mail.
 *
 * 🔴 POR QUE BASE64 E NÃO `multipart`. O app do entregador não fala HTTP direto:
 * ele passa por uma ponte Kotlin (`native.js` → `bridge.request`) que
 * `JSON.stringify` o corpo. Multipart NÃO ATRAVESSA essa ponte — um
 * `FileInterceptor` aqui seria uma porta que o único cliente desta rota não tem
 * como usar. Quem reduz a foto é o app (canvas, 1600 px, JPEG 0,7: a lista fica
 * legível pra quem vai digitar e o corpo cai pra centenas de KB), e o teto de
 * 3 MB do `useBodyParser` do `main.ts` é o limite de cima.
 *
 * 🔴 O QUE ISTO NÃO FAZ: não cria cliente, não lê a foto, não chama OCR. Quem
 * digita é gente, e é justamente por isso que a promessa da tela é "até 24
 * horas" e não "pronto". Prometer instantâneo aqui seria a mesma mentira de um
 * botão que não tem porta.
 */
@Injectable()
export class LogisticaCadastroMassaService {
  private readonly logger = new Logger(LogisticaCadastroMassaService.name);

  /* Teto do CORPO já decodificado. O `main.ts` deixa passar 3 MB de JSON, e
     base64 infla ~33% — 2 MB de imagem é o que sobra com folga pro resto do
     envelope. Foto de caderno reduzida no app fica em centenas de KB. */
  private static readonly LIMITE_BYTES = 2 * 1024 * 1024;
  private static readonly TIPOS_ACEITOS = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/pdf',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  private destino() {
    return String(process.env.ADMIN_SUPPORT_EMAIL || 'jbinformatica1100@gmail.com').trim();
  }

  async registrar(
    companyId: number,
    actor: { id?: number | string; nome?: string | null; email?: string | null } | null,
    dto: { arquivo?: string; nome?: string; observacao?: string } | null,
  ) {
    /* `data:image/jpeg;base64,AAAA…` — o formato que o `FileReader` do app
       devolve. Aceita também o base64 cru, porque o dia em que alguém mandar
       sem o prefixo o pedido não pode virar erro por causa de pontuação. */
    const bruto = String(dto?.arquivo || '').trim();
    if (!bruto) throw new BadRequestException('Nenhuma foto chegou. Tente tirar a foto de novo.');

    const casado = /^data:([^;,]+);base64,(.*)$/s.exec(bruto);
    const tipo = String(casado ? casado[1] : 'image/jpeg').toLowerCase();
    const base64 = casado ? casado[2] : bruto;
    if (!LogisticaCadastroMassaService.TIPOS_ACEITOS.has(tipo)) {
      throw new BadRequestException('Mande uma foto (JPG, PNG) ou um PDF.');
    }

    let conteudo: Buffer;
    try {
      conteudo = Buffer.from(base64, 'base64');
    } catch {
      throw new BadRequestException('Não consegui ler essa foto. Tente tirar de novo.');
    }
    if (!conteudo.length) throw new BadRequestException('A foto chegou vazia. Tente de novo.');
    if (conteudo.length > LogisticaCadastroMassaService.LIMITE_BYTES) {
      throw new BadRequestException('A foto ficou grande demais. Tente de novo com menos zoom.');
    }

    const empresa = await this.prisma.company
      .findUnique({ where: { id: companyId }, select: { id: true, name: true, slug: true } })
      .catch(() => null);

    const nomeEmpresa = String(empresa?.name || empresa?.slug || `empresa ${companyId}`);
    const quem = String(actor?.nome || actor?.email || actor?.id || 'sem identificação');
    const anexo: MailAttachment = {
      filename: String(dto?.nome || 'lista-de-clientes.jpg').replace(/[^\w.\- ]/g, '').slice(0, 80) || 'lista-de-clientes.jpg',
      content: conteudo,
      contentType: tipo,
    };

    const linhas = [
      'Pedido de cadastro de clientes por foto (app do entregador).',
      '',
      `Empresa: ${nomeEmpresa} (id ${companyId})`,
      `Pedido por: ${quem}`,
      `Arquivo: ${anexo.filename} · ${(conteudo.length / 1024).toFixed(0)} KB · ${tipo}`,
    ];
    if (dto?.observacao) linhas.push('', `Recado do cliente: ${String(dto.observacao).slice(0, 500)}`);
    linhas.push('', 'A tela do app prometeu retorno em até 24 horas.');

    const envio = await this.mail.sendMail({
      to: this.destino(),
      subject: `[HBX] Cadastro de clientes por foto — ${nomeEmpresa}`,
      text: linhas.join('\n'),
      attachments: [anexo],
    });

    /* 🔴 O CLIENTE NÃO PAGA PELO CANAL DA HBX ESTAR NO CHÃO. Se o e-mail falhar,
       a tela dele ainda diz "recebemos" — e o log grita pra que alguém daqui vá
       atrás. Devolver erro aqui faria a pessoa tirar a mesma foto quatro vezes
       achando que o celular dela é o problema. */
    if (!envio.ok && !envio.queued) {
      this.logger.error(
        `[cadastro-massa] NÃO SAIU company=${companyId} arquivo=${anexo.filename} erro=${envio.errorCode || ''} ${envio.errorMessage || ''}`,
      );
    } else {
      this.logger.log(`[cadastro-massa] recebido company=${companyId} arquivo=${anexo.filename} (${conteudo.length} bytes)`);
    }

    return { ok: true, recebidoEm: new Date().toISOString() };
  }
}
