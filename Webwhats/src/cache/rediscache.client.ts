import { CacheConf, CacheConfRedis, configService } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { createClient, RedisClientType } from 'redis';

class Redis {
  private logger = new Logger('Redis');
  private client: RedisClientType = null;
  private conf: CacheConfRedis;
  private connected = false;
  private connecting = false;

  constructor() {
    this.conf = configService.get<CacheConf>('CACHE')?.REDIS;
  }

  getConnection(): RedisClientType {
    if (this.connected && this.client) {
      return this.client;
    }
    if (this.connecting && this.client) {
      return this.client;
    } else {
      this.client = createClient({
        url: this.conf.URI,
      });

      this.client.on('connect', () => {
        this.logger.verbose('redis connecting');
      });

      this.client.on('ready', () => {
        this.logger.verbose('redis ready');
        this.connected = true;
        this.connecting = false;
      });

      this.client.on('error', (error) => {
        this.logger.error(`redis error: ${error?.message || error}`);
        this.connected = false;
      });

      this.client.on('end', () => {
        this.logger.verbose('redis connection ended');
        this.connected = false;
        this.connecting = false;
      });

      this.connecting = true;
      void this.client
        .connect()
        .then(() => {
          this.connected = true;
          this.connecting = false;
        })
        .catch((e) => {
          this.connected = false;
          this.connecting = false;
          this.logger.error('redis connect exception caught: ' + e);
        });

      return this.client;
    }
  }
}

export const redisClient = new Redis();
