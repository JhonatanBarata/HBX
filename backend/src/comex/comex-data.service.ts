import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/**
 * HBX COMEX — camada de dados analítica, ISOLADA do Postgres do CRM.
 *
 * Lê os Parquet gerados pelo pipeline `comex-motor/` (export_parquet.py) com um
 * DuckDB em memória. Parquet é o contrato entre o motor Python e a API Node —
 * formato estável entre versões, sem briga de storage do .duckdb.
 *
 * Dado ausente NUNCA derruba endpoint (padrão painel-modulo): `available()`
 * devolve false e o controller responde estado vazio; a tela mostra "—".
 */
@Injectable()
export class ComexDataService implements OnModuleDestroy {
  private readonly logger = new Logger('ComexData');
  private connPromise: Promise<any> | null = null;
  private instance: any = null;

  private dataDir(): string {
    return (
      process.env.HBX_COMEX_DATA_DIR ||
      path.resolve(process.cwd(), '..', 'comex-motor', 'data', 'parquet')
    );
  }

  available(): boolean {
    try {
      return fs.existsSync(path.join(this.dataDir(), 'flow_mun.parquet'));
    } catch {
      return false;
    }
  }

  private async connect(): Promise<any> {
    if (!this.connPromise) {
      this.connPromise = (async () => {
        // Import dinâmico: binding nativo só carrega se o módulo for usado —
        // ambiente sem o pacote/binário não derruba o boot do backend inteiro.
        const { DuckDBInstance } = await import('@duckdb/node-api');
        this.instance = await DuckDBInstance.create(':memory:');
        const conn = await this.instance.connect();
        const dir = this.dataDir().replace(/\\/g, '/');
        const tables = [
          'flow_mun', 'flow_ncm', 'cadastro_atual',
          'aux_ncm', 'aux_ncm_sh', 'aux_pais', 'aux_uf_mun', 'aux_via', 'aux_urf',
        ];
        for (const t of tables) {
          await conn.run(`CREATE VIEW ${t} AS SELECT * FROM read_parquet('${dir}/${t}.parquet')`);
        }
        this.logger.log(`Comex analítico pronto (dir=${dir})`);
        return conn;
      })().catch((error) => {
        this.connPromise = null;
        throw error;
      });
    }
    return this.connPromise;
  }

  /**
   * Consulta com resultado JSON-safe (BIGINT→Number via CAST nas queries; aqui
   * só normaliza o que sobrar). Inputs são validados ANTES pelos chamadores —
   * este serviço não recebe texto cru do usuário sem sanitização.
   */
  async query(sql: string): Promise<Array<Record<string, unknown>>> {
    const conn = await this.connect();
    const reader = await conn.runAndReadAll(sql);
    return reader.getRowObjects().map((row: Record<string, unknown>) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        out[k] = typeof v === 'bigint' ? Number(v) : v;
      }
      return out;
    });
  }

  onModuleDestroy() {
    try {
      this.instance?.closeSync?.();
    } catch {
      /* melhor esforço — processo está morrendo */
    }
  }
}
