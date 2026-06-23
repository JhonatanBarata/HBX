export type BotTypeKey = 'atendimento' | 'recovery' | 'prospeccao';

export class PutBotActivationDto {
  type!: BotTypeKey;
  live!: boolean;
}

export class MarkBotTestedDto {
  type!: BotTypeKey;
}
