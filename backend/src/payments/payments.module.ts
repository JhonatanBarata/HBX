import { Module } from '@nestjs/common';
import { MercadoPagoClientService } from './mercado-pago-client.service';

@Module({
  providers: [MercadoPagoClientService],
  exports: [MercadoPagoClientService],
})
export class PaymentsModule {}

