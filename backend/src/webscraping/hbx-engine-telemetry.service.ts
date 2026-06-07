import { Injectable } from '@nestjs/common';
import { HbxEngineDockerAdapterService } from './hbx-engine-docker-adapter.service';
import type { HbxEngineActualState } from './hbx-engine-pool.service';

export type HbxEngineContainerTelemetry = {
  name: string;
  exists: boolean;
  running: boolean;
  status: string;
  health: 'healthy' | 'unhealthy' | 'starting' | 'none' | 'unknown';
  actualState: HbxEngineActualState;
  memoryRssMb: number | null;
};

@Injectable()
export class HbxEngineTelemetryService {
  constructor(private readonly docker: HbxEngineDockerAdapterService) {}

  async getEngineTelemetry(names: string[]) {
    const result = new Map<string, HbxEngineContainerTelemetry>();
    for (const name of names) {
      const inspect = await this.docker.inspectEngine(name);
      const stats = inspect.running ? await this.docker.readEngineStats(name) : { memoryRssMb: null };
      result.set(name, {
        name,
        exists: inspect.exists,
        running: inspect.running,
        status: inspect.status,
        health: inspect.health,
        actualState: !inspect.exists ? 'missing' : inspect.running ? 'running' : 'exited',
        memoryRssMb: stats.memoryRssMb,
      });
    }
    return result;
  }
}
