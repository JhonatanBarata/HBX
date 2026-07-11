import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SupportService } from './support.service';

class ContactAdminDto {
  companySlug: string;
  username?: string;
  phone: string;
  message?: string;
}

@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  // Rota PÚBLICA que dispara e-mail + WhatsApp pro admin: throttle dedicado (5/min) contra
  // abuso/flood do canal de suporte (mesmo padrão do credits-public.controller.ts).
  @Post('contact-admin')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async contactAdmin(@Body() dto: ContactAdminDto) {
    const result = await this.support.contactAdmin(dto);
    // Não ecoar de volta dados refletidos do próprio caller (customerName/customerPhone).
    // Só confirmação + id do ticket gerado, quando houver.
    const ticketId = result?.ticket?.id ?? null;
    return ticketId ? { ok: true, ticketId } : { ok: true };
  }
}
