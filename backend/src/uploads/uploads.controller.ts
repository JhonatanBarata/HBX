import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { createReadStream, existsSync, statSync } from 'fs';
import {
  getInboxMediaFileCandidates,
  isSafeInboxMediaFilename,
  resolveInboxMediaResponseType,
  verifyInboxMediaSignature,
} from './inbox-media.util';

// P1.3: única porta de acesso à mídia do inbox depois que os arquivos saíram de
// backend/public. A rota do Nest é registrada ANTES do middleware do ServeStaticModule
// (rotas de controller entram no router na init; o serve-static só registra o
// express.static no onModuleInit) — mesmo um arquivo esquecido no public antigo não é
// mais alcançável por /uploads/inbox/* sem assinatura. Confirmado por teste com o app
// montado em uploads.controller.test.ts.
@Controller('uploads')
export class UploadsController {
  // Mídia de conversa carrega em rajada (N <img>/<audio> por thread aberta); o gate de
  // acesso aqui é a assinatura, não o throttle global.
  @SkipThrottle()
  @Get('inbox/:filename')
  serveInboxMedia(
    @Param('filename') filename: string,
    @Query('e') expiresAt: string,
    @Query('s') signature: string,
    @Res() res: Response,
  ) {
    if (!isSafeInboxMediaFilename(filename)) {
      throw new NotFoundException('Arquivo não encontrado.');
    }
    if (!verifyInboxMediaSignature(filename, expiresAt, signature)) {
      throw new ForbiddenException('Link de mídia inválido ou expirado.');
    }

    const candidates = getInboxMediaFileCandidates(filename) || [];
    const filePath = candidates.find((candidate) => existsSync(candidate));
    if (!filePath) {
      throw new NotFoundException('Arquivo não encontrado.');
    }

    const { contentType, inline } = resolveInboxMediaResponseType(filename);
    const fileSize = statSync(filePath).size;

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');

    // Range simples (um intervalo) pro seek de <audio>/<video> funcionar como no estático.
    const rangeHeader = String(res.req?.headers?.range || '');
    const rangeMatch = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
    if (rangeMatch && fileSize > 0 && (rangeMatch[1] || rangeMatch[2])) {
      const start = rangeMatch[1] ? Number(rangeMatch[1]) : fileSize - Number(rangeMatch[2]);
      const end = rangeMatch[1] && rangeMatch[2] ? Math.min(Number(rangeMatch[2]), fileSize - 1) : fileSize - 1;
      if (Number.isFinite(start) && start >= 0 && start <= end && start < fileSize) {
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        res.setHeader('Content-Length', end - start + 1);
        createReadStream(filePath, { start, end }).pipe(res);
        return;
      }
      res.status(416);
      res.setHeader('Content-Range', `bytes */${fileSize}`);
      res.end();
      return;
    }

    res.setHeader('Content-Length', fileSize);
    createReadStream(filePath).pipe(res);
  }
}
