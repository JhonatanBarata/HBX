import { Body, Controller, Post } from '@nestjs/common';
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

  @Post('contact-admin')
  async contactAdmin(@Body() dto: ContactAdminDto) {
    return this.support.contactAdmin(dto);
  }
}
