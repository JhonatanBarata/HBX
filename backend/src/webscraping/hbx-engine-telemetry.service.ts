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
    const inspections = await this.docker.inspectEngines(names);
    const runningNames = names.filter((name) => inspections.get(name)?.running);
    const statsByName = await this.docker.readEnginesStats(runningNames);

    for (const name of names) {
      const inspect = inspections.get(name) || {
        name,
        exists: false,
        running: false,
        status: 'missing',
        health: 'unknown' as const,
      };
      const stats = statsByName.get(name) || { memoryRssMb: null };
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
