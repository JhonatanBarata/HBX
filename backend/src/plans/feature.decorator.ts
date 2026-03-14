import { SetMetadata } from '@nestjs/common';

export const FEATURE_KEY = 'feature_key';
export const Feature = (key: string) => SetMetadata(FEATURE_KEY, key);
