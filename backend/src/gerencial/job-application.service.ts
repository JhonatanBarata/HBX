import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { isTenantCompany } from '../common/company-kind';

// Trabalhe Conosco (trilha Produtos & Comissão, 12/06/2026):
// candidatura PÚBLICA aberta — tabela própria (HbxJobApplication), separada
// do pipeline de indicações (que carrega herança de comissão). A aprovação
// marca o candidato; o convite real segue o fluxo de equipe existente.

type PublicApplicationInput = {
  companySlug?: string;
  name?: string;
  phone?: string;
  email?: string;
  city?: string;
  experience?: string;
  resumeUrl?: string;
};

@Injectable()
export class JobApplicationService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeText(value: unknown, max = 280) {
    const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
    return normalized ? normalized.slice(0, max) : null;
  }

  private normalizePhoneDigits(value: unknown) {
    const digits = String(value ?? '').replace(/\D/g, '');
    return digits.length >= 10 ? digits : null;
  }

  async createPublicApplication(input: PublicApplicationInput) {
    const slug = this.normalizeText(input?.companySlug, 80);
    if (!slug) throw new ServiceUnavailableException('Página de candidaturas não configurada (empresa não informada).');
    const company = await this.prisma.company.findFirst({
      where: { slug },
      select: { id: true, companyKind: true, name: true },
    });
    if (!company || !isTenantCompany(company)) {
      throw new NotFoundException('Empresa de contratação não encontrada.');
    }

    const name = this.normalizeText(input?.name, 160);
    const phone = this.normalizeText(input?.phone, 30);
    const phoneNormalized = this.normalizePhoneDigits(phone);
    if (!name) throw new BadRequestException('Informe seu nome.');
    if (!phone || !phoneNormalized) throw new BadRequestException('Informe um WhatsApp válido com DDD.');

    const existing = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "HbxJobApplication"
      WHERE "companyId" = ${company.id}
        AND "phoneNormalized" = ${phoneNormalized}
        AND "status" = 'pending'
      LIMIT 1
    `.catch(() => []);
    if (existing.length > 0) {
      return { ok: true, alreadyPending: true, message: 'Sua candidatura já está na fila — em breve entraremos em contato.' };
    }

    const email = this.normalizeText(input?.email, 160);
    const city = this.normalizeText(input?.city, 120);
    const experience = this.normalizeText(input?.experience, 1000);
    const resumeUrl = this.normalizeText(input?.resumeUrl, 500);

    const applicationId = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO "HbxJobApplication"
        ("id", "companyId", "name", "phone", "phoneNormalized", "email", "city", "experience", "resumeUrl", "status", "createdAt", "updatedAt")
      VALUES
        (${applicationId}, ${company.id}, ${name}, ${phone}, ${phoneNormalized}, ${email}, ${city}, ${experience}, ${resumeUrl}, 'pending', NOW(), NOW())
    `;

    // aviso imediato ao admin no sino (audiência customer) — best-effort
    await this.prisma.masterNotice.create({
      data: {
        companyId: company.id,
        audience: 'customer',
        tone: 'info',
        title: `Nova candidatura: ${name}`,
        body: [
          `${name} se candidatou pelo Trabalhe Conosco.`,
          city ? `Cidade: ${city}.` : null,
          `WhatsApp: ${phone}.`,
          'Revise em Gerencial → Parceiros & Candidaturas.',
        ].filter(Boolean).join(' '),
      },
    }).catch(() => undefined);

    return { ok: true, alreadyPending: false, message: 'Candidatura recebida! Vamos analisar e chamar você no WhatsApp.' };
  }

  private async assertAdminTenant(user: any) {
    const companyId = Number(user?.companyId || 0);
    if (!companyId) throw new ForbiddenException('Company context required');
    const role = String(user?.role || '').toUpperCase();
    if (role !== 'ADMIN' && !user?.isSystemMaster) {
      throw new ForbiddenException('Apenas Admin revisa candidaturas.');
    }
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { companyKind: true } });
    if (!company || !isTenantCompany(company)) {
      throw new ForbiddenException('Candidaturas estão disponíveis apenas para empresas tenant.');
    }
    return companyId;
  }

  async listForAdmin(user: any) {
    const companyId = await this.assertAdminTenant(user);
    const rows = await this.prisma.$queryRaw<Array<any>>`
      SELECT "id", "name", "phone", "email", "city", "experience", "resumeUrl", "status", "reviewedAt", "createdAt"
      FROM "HbxJobApplication"
      WHERE "companyId" = ${companyId}
      ORDER BY (CASE WHEN "status" = 'pending' THEN 0 ELSE 1 END), "createdAt" DESC
      LIMIT 200
    `;
    return { ok: true, applications: rows };
  }

  async review(user: any, applicationId: string, input: { action?: string; note?: string | null }) {
    const companyId = await this.assertAdminTenant(user);
    const action = String(input?.action || '').trim().toLowerCase();
    if (!['approve', 'reject'].includes(action)) {
      throw new BadRequestException('Ação inválida: use approve ou reject.');
    }
    const id = this.normalizeText(applicationId, 80);
    if (!id) throw new BadRequestException('Candidatura inválida.');
    const rows = await this.prisma.$queryRaw<Array<{ id: string; status: string; name: string; email: string | null }>>`
      SELECT "id", "status", "name", "email" FROM "HbxJobApplication"
      WHERE "id" = ${id} AND "companyId" = ${companyId}
      LIMIT 1
    `;
    const application = rows[0];
    if (!application) throw new NotFoundException('Candidatura não encontrada.');
    if (application.status !== 'pending') throw new BadRequestException('Esta candidatura já foi revisada.');

    const status = action === 'approve' ? 'approved' : 'rejected';
    const note = this.normalizeText(input?.note, 280);
    await this.prisma.$executeRaw`
      UPDATE "HbxJobApplication"
      SET "status" = ${status},
          "note" = ${note},
          "reviewedByUserId" = ${Number(user?.id || 0) || null},
          "reviewedAt" = NOW(),
          "updatedAt" = NOW()
      WHERE "id" = ${id}
    `;

    return {
      ok: true,
      id,
      status,
      // aprovação não cria usuário sozinha: o convite oficial (com o e-mail
      // de equipe comercial) sai pelo fluxo de equipe existente.
      nextStep: action === 'approve'
        ? `Aprovado. Convide ${application.name} pela Equipe (Configurações → Equipe → Convidar membro)${application.email ? ` usando ${application.email}` : ''}.`
        : 'Candidatura rejeitada.',
    };
  }
}
