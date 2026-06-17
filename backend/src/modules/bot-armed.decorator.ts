import { SetMetadata } from '@nestjs/common';

export const BOT_ARMED_KEY = 'bot_armed';
export const BotArmed = () => SetMetadata(BOT_ARMED_KEY, true);
