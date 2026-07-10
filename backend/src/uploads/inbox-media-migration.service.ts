import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import {
  getInboxPrivateMediaDir,
  getLegacyInboxPublicMediaDir,
} from './inbox-media.util';

// P1.3: leva os anexos existentes de public/uploads/inbox (servido sem guard pelo
// ServeStaticModule) pro storage privado. Idempotente e best-effort: dir vazio ou
// inexistente é caso normal, e NENHUMA falha aqui pode derrubar o boot
// (build verde ≠ boot ok).
//
// DEFAULT = COPIAR preservando o original. Motivo (10/07): no prod o único volume do
// backend é ./backend/public/uploads:/app/public/uploads — /app/storage é fs EFÊMERO
// do container até o compose ganhar o volume ./backend/storage:/app/storage. Mover
// (rename) tiraria o histórico do volume persistente e um recreate perderia tudo.
// A cópia pública remanescente NÃO volta a vazar: a rota assinada do UploadsController
// intercepta /uploads/inbox/* na frente do estático (provado em uploads.controller.test.ts).
// Depois que o volume do storage existir na infra, setar
// HBX_INBOX_MEDIA_MIGRATION_DELETE=true pra remover as cópias públicas.
@Injectable()
export class InboxMediaMigrationService implements OnModuleInit {
  private readonly logger = new Logger(InboxMediaMigrationService.name);

  onModuleInit() {
    try {
      const deleteLegacy =
        String(process.env.HBX_INBOX_MEDIA_MIGRATION_DELETE || '').trim().toLowerCase() === 'true';
      const legacyDir = getLegacyInboxPublicMediaDir();
      if (!existsSync(legacyDir)) return;

      const entries = readdirSync(legacyDir, { withFileTypes: true });
      const files = entries.filter((entry) => entry.isFile());
      if (!files.length) return;

      const privateDir = getInboxPrivateMediaDir();
      mkdirSync(privateDir, { recursive: true });

      let copied = 0;
      let removed = 0;
      let failed = 0;
      for (const entry of files) {
        const from = join(legacyDir, entry.name);
        const to = join(privateDir, entry.name);
        try {
          if (!existsSync(to)) {
            copyFileSync(from, to);
            copied += 1;
          }
          if (deleteLegacy) {
            unlinkSync(from);
            removed += 1;
          }
        } catch (error) {
          failed += 1;
          this.logger.warn(
            `Falha ao migrar ${entry.name} pro storage privado (segue servível pelo fallback assinado): ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      if (copied || removed || failed) {
        this.logger.log(
          `Mídia do inbox → storage privado: ${copied} copiado(s)` +
            `${removed ? `, ${removed} cópia(s) pública(s) removida(s)` : ''}` +
            `${failed ? `, ${failed} falha(s)` : ''}.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Migração de mídia do inbox falhou (boot segue; leitura tem fallback pro dir legado): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
