import { Controller, Get, Query, NotFoundException, UseGuards, Req, Patch, Param, ParseIntPipe, Body, BadRequestException, ForbiddenException, Post, Logger, Delete } from '@nestjs/common';
import { UsersService } from './users.service';
import { SellerOnboardingService } from '../gerencial/seller-onboarding.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Admin } from '../auth/admin.decorator';
import { MasterGuard } from '../auth/guards/master.guard';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { assertPasswordPolicy } from '../auth/password-policy';
import { MasterContextService } from '../master-context/master-context.service';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { EmailTemplateService } from '../mail/email-template.service';
import {
	BUSINESS_CARD_CID,
	HbxPresentationEmailService,
} from '../mail/hbx-presentation-email.service';
import { MailService, type MailAttachment, type MailSendResult } from '../mail/mail.service';
import { HbxPartnerReferralService } from '../gerencial/hbx-partner-referral.service';
import * as crypto from 'crypto';

class UpdateRoleDto {
	@IsString()
	@IsIn(['USER', 'ADMIN'])
	role!: 'USER' | 'ADMIN';
}

class CreateCompanyUserDto {
	@IsEmail()
	email!: string;

	@IsOptional()
	@IsString()
	name?: string;

	@IsOptional()
	@IsString()
	phone?: string;

	@IsOptional()
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(100)
	commissionPercent?: number;

	@IsOptional()
	@IsBoolean()
	canRecruitSellers?: boolean;

	@IsOptional()
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(100)
	sellerReferralCommissionPercent?: number;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	referredByUserId?: number;

	@IsOptional()
	@IsString()
	referralCandidateId?: string;

	@IsOptional()
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(100)
	referredByCommissionPercentSnapshot?: number;

	@IsOptional()
	@IsString()
	@MinLength(8)
	password?: string;

	@IsOptional()
	@IsString()
	cpf?: string;

	@IsOptional()
	@IsString()
	declaredAddress?: string;

	@IsOptional()
	@IsBoolean()
	requiresSellerOnboarding?: boolean;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	@Max(30)
	commissionDueBusinessDays?: number;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	@Max(500)
	sellerDistributionDailyLimitOverride?: number;

	@IsOptional()
	@IsString()
	@IsIn(['USER', 'ADMIN'])
	role?: 'USER' | 'ADMIN';
}

class ToggleActiveDto {
	@IsOptional()
	@IsBoolean()
	active?: boolean;
}

class UpdateCompanyUserProfileDto {
	@IsOptional()
	@IsString()
	name?: string;

	@IsOptional()
	@IsString()
	phone?: string;

	@IsOptional()
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(100)
	commissionPercent?: number;

	@IsOptional()
	@IsBoolean()
	canRecruitSellers?: boolean;

	@IsOptional()
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(100)
	sellerReferralCommissionPercent?: number;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	referredByUserId?: number;

	@IsOptional()
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(100)
	referredByCommissionPercentSnapshot?: number;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	@Max(500)
	sellerDistributionDailyLimitOverride?: number;
}

class MasterCreateUserDto {
	@IsEmail()
	email!: string;

	@IsOptional()
	@IsString()
	username?: string;

	@IsOptional()
	@IsString()
	name?: string;

	@IsOptional()
	@IsString()
	phone?: string;

	@IsOptional()
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(100)
	commissionPercent?: number;

	@IsOptional()
	@IsBoolean()
	canRecruitSellers?: boolean;

	@IsOptional()
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(100)
	sellerReferralCommissionPercent?: number;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	referredByUserId?: number;

	@IsOptional()
	@IsString()
	referralCandidateId?: string;

	@IsOptional()
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(100)
	referredByCommissionPercentSnapshot?: number;

	@IsOptional()
	@IsString()
	@IsIn(['USER', 'ADMIN'])
	role?: 'USER' | 'ADMIN';

	@IsOptional()
	@IsString()
	@MinLength(8)
	password?: string;

	@IsOptional()
	@IsString()
	cpf?: string;

	@IsOptional()
	@IsString()
	declaredAddress?: string;

	@IsOptional()
	@IsBoolean()
	requiresSellerOnboarding?: boolean;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	@Max(30)
	commissionDueBusinessDays?: number;
}

class MasterEditUserDto {
	@IsOptional()
	@IsEmail()
	email?: string;

	@IsOptional()
	@IsString()
	username?: string;

	@IsOptional()
	@IsString()
	name?: string;

	@IsOptional()
	@IsString()
	phone?: string;

	@IsOptional()
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(100)
	commissionPercent?: number;

	@IsOptional()
	@IsBoolean()
	canRecruitSellers?: boolean;

	@IsOptional()
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(100)
	sellerReferralCommissionPercent?: number;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	referredByUserId?: number;

	@IsOptional()
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(100)
	referredByCommissionPercentSnapshot?: number;

	@IsOptional()
	@IsString()
	@IsIn(['USER', 'ADMIN'])
	role?: 'USER' | 'ADMIN';

	@IsOptional()
	@IsBoolean()
	isActive?: boolean;
}

class CreateReferredSellerDto {
	@IsString()
	name!: string;

	@IsOptional()
	@IsString()
	phone?: string;

	@IsOptional()
	@IsString()
	note?: string;

	@IsOptional()
	preferredSegments?: string[];

	@IsOptional()
	@IsString()
	preferredSegment?: string;

	@IsOptional()
	@IsString()
	cityRegion?: string;

	@IsOptional()
	@IsEmail()
	email?: string;

	@IsOptional()
	@IsString()
	password?: string;
}

class MasterResetPasswordDto {
	@IsOptional()
	@IsString()
	@MinLength(8)
	password?: string;
}

function normalizeNullableText(value: unknown) {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim().replace(/\s+/g, ' ');
	return trimmed || null;
}

function normalizeCommissionPercent(value: unknown) {
	if (value === undefined || value === null || value === '') return undefined;
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) throw new BadRequestException('Comissão inválida');
	return Math.min(100, Math.max(0, Math.round(numeric * 100) / 100));
}

function normalizeOptionalPositiveInt(value: unknown) {
	if (value === undefined || value === null || value === '') return undefined;
	const numeric = Number(value);
	if (!Number.isInteger(numeric) || numeric <= 0) throw new BadRequestException('Indicador inválido');
	return numeric;
}

function normalizeStringList(value: unknown) {
	const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
	return values
		.map((item) => String(item || '').trim().replace(/\s+/g, ' '))
		.filter(Boolean)
		.slice(0, 10);
}

function buildPreferredSegmentsJson(dto: CreateReferredSellerDto) {
	const segments = normalizeStringList(dto.preferredSegments);
	const singleSegment = String(dto.preferredSegment || '').trim().replace(/\s+/g, ' ');
	if (singleSegment) segments.push(singleSegment);
	const uniqueSegments = Array.from(new Set(segments)).slice(0, 10);
	const cityRegion = String(dto.cityRegion || '').trim().replace(/\s+/g, ' ');
	if (!uniqueSegments.length && !cityRegion) return null;
	return JSON.stringify({
		segments: uniqueSegments,
		cityRegion: cityRegion || null,
	});
}

@Controller('users')
export class UsersController {
	private readonly logger = new Logger(UsersController.name);

	constructor(
		private readonly usersService: UsersService,
		private readonly masterContextService: MasterContextService,
		private readonly mailService: MailService,
		private readonly emailTemplates: EmailTemplateService,
		private readonly hbxPresentationEmails: HbxPresentationEmailService,
		private readonly sellerOnboardingService: SellerOnboardingService,
		private readonly hbxPartnerReferrals: HbxPartnerReferralService,
	) {}

	private buildAppUrl() {
		return String(process.env.APP_URL || process.env.FRONTEND_URL || 'https://hbxsystem.com.br').replace(/\/$/, '');
	}

	private roleWelcomeLabel(role: 'USER' | 'ADMIN') {
		return role === 'ADMIN' ? 'admin' : 'vendedor';
	}

	private createEmailConfirmationToken() {
		return crypto.randomBytes(32).toString('base64url');
	}

	private hashEmailConfirmationToken(rawToken: string) {
		return crypto.createHash('sha256').update(rawToken).digest('hex');
	}

	private shouldExposeEmailConfirmationDebugLink() {
		const debugEnabled = String(process.env.AUTH_DEBUG_CONFIRMATION_LINK || '').trim().toLowerCase() === 'true';
		return debugEnabled && String(process.env.NODE_ENV || '').trim().toLowerCase() !== 'production';
	}

	private buildEmailConfirmationLink(rawToken: string) {
		return `${this.buildAppUrl()}/confirm-email?token=${encodeURIComponent(rawToken)}`;
	}

	private async prepareEmailConfirmationLink(input: { userId: number; email?: string | null }) {
		const userId = Number(input.userId || 0);
		const email = String(input.email || '').trim().toLowerCase();
		if (!userId || !email) return null;
		const rawToken = this.createEmailConfirmationToken();
		const confirmationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
		await this.usersService.updateById(userId, {
			emailConfirmationToken: this.hashEmailConfirmationToken(rawToken),
			emailConfirmationSentAt: new Date(),
			emailConfirmationExpiresAt: confirmationExpiresAt,
		});
		return this.buildEmailConfirmationLink(rawToken);
	}

	private async sendAccountConfirmationEmail(input: {
		userId: number;
		email?: string | null;
		username?: string | null;
		name?: string | null;
		companyName?: string | null;
		source: string;
	}): Promise<Pick<MailSendResult, 'ok' | 'transport' | 'messageId' | 'errorCode' | 'errorMessage'> & { previewUrl?: string | null; confirmUrl?: string | null } | null> {
		const userId = Number(input.userId || 0);
		const email = String(input.email || '').trim().toLowerCase();
		if (!userId || !email) return null;
		const confirmationLink = await this.prepareEmailConfirmationLink({ userId, email });
		if (!confirmationLink) return null;
		const template = await this.emailTemplates.getTemplateSafe('email_confirmation');
		const displayName = String(input.name || input.username || email).trim();
		const rendered = this.emailTemplates.renderTemplate(template, {
			nome: displayName,
			empresa: String(input.companyName || 'HBX').trim(),
			email,
			linkConfirmacao: confirmationLink,
			ano: new Date().getFullYear(),
		});

		try {
			const result = await this.mailService.sendMail({
				to: email,
				subject: rendered.subject,
				text: rendered.text,
				html: rendered.html,
			});
			return {
				ok: result.ok,
				transport: result.transport,
				messageId: result.messageId,
				errorCode: result.errorCode,
				errorMessage: result.errorMessage,
				previewUrl: result.previewUrl,
				confirmUrl: this.shouldExposeEmailConfirmationDebugLink() ? confirmationLink : null,
			};
		} catch (error) {
			this.logger.warn(`Falha ao enviar confirmação de e-mail para user ${userId} (${input.source}): ${error instanceof Error ? error.message : error}`);
			return {
				ok: false,
				transport: this.mailService.getConfigurationSummary().mode,
				messageId: null,
				errorCode: 'EMAIL_CONFIRMATION_DELIVERY_FAILED',
				errorMessage: error instanceof Error ? error.message : String(error),
				previewUrl: null,
				confirmUrl: this.shouldExposeEmailConfirmationDebugLink() ? confirmationLink : null,
			};
		}
	}

	private async sendWelcomeAccessEmail(input: {
		email: string;
		login: string;
		password: string;
		name?: string | null;
		role: 'USER' | 'ADMIN';
		source: string;
		companyId?: number | null;
		commissionPercent?: number | null;
		sellerReferralCommissionPercent?: number | null;
		referredByCommissionPercentSnapshot?: number | null;
	}): Promise<Pick<MailSendResult, 'ok' | 'transport' | 'messageId' | 'errorCode' | 'errorMessage'> | null> {
		const email = String(input.email || '').trim().toLowerCase();
		const login = String(input.login || email).trim();
		const password = String(input.password || '');
		if (!email || !login || !password) return null;
		const summary = this.mailService.getConfigurationSummary();
		if (summary.mode === 'log') {
			return {
				ok: false,
				transport: 'log',
				messageId: null,
				errorCode: 'WELCOME_EMAIL_PROVIDER_NOT_CONFIGURED',
				errorMessage: 'Provedor transacional não configurado. E-mail de boas-vindas não enviado.',
			};
		}
		const displayName = String(input.name || login).trim();
		const appUrl = this.buildAppUrl();
		const dueBusinessDays = await this.usersService.getCompanyCommissionDueBusinessDays(input.companyId);
		const inheritancePercent = Number(input.referredByCommissionPercentSnapshot ?? input.sellerReferralCommissionPercent ?? 0) || 0;
		const template = await this.emailTemplates.getTemplateSafe('seller_welcome');
		const businessCardFile = await this.hbxPresentationEmails.readBusinessCardContent();
		const businessCardMeta = businessCardFile?.meta || null;
		const hasBusinessCard = Boolean(businessCardFile && businessCardMeta);
		const rendered = this.emailTemplates.renderTemplate(template, {
			nome: displayName,
			email,
			tipoAcesso: this.roleWelcomeLabel(input.role),
			acesso: login,
			senha: password,
			linkAcesso: `${appUrl}/login`,
			linkMobile: `${appUrl}/mobile/login`,
			ano: new Date().getFullYear(),
			vendedor: displayName,
			emailvendedor: login,
			senhavendedor: password,
			comissao: Number(input.commissionPercent || 0) || 0,
			comissaoheranca: inheritancePercent,
			d3: `D+${dueBusinessDays} úteis`,
			diascomissao: dueBusinessDays,
		}, {
			appendHtml: hasBusinessCard ? this.hbxPresentationEmails.buildBusinessCardHtml() : null,
		});
		const attachments: MailAttachment[] = [];
		if (businessCardFile && businessCardMeta && hasBusinessCard) {
			attachments.push({
				filename: businessCardMeta.originalName || 'cartao-visitas.png',
				content: businessCardFile.content,
				contentType: businessCardFile.contentType || businessCardMeta.mimeType || 'image/png',
				cid: BUSINESS_CARD_CID,
			});
		}
		try {
			const result = await this.mailService.sendMail({
				to: email,
				subject: rendered.subject,
				text: rendered.text,
				html: rendered.html,
				attachments,
			});
			return {
				ok: result.ok,
				transport: result.transport,
				messageId: result.messageId,
				errorCode: result.errorCode,
				errorMessage: result.errorMessage,
			};
		} catch (error) {
			this.logger.warn(`Falha ao enviar boas-vindas HBX para user ${login} (${input.source}): ${error instanceof Error ? error.message : error}`);
			return {
				ok: false,
				transport: this.mailService.getConfigurationSummary().mode,
				messageId: null,
				errorCode: 'WELCOME_EMAIL_FAILED',
				errorMessage: error instanceof Error ? error.message : String(error),
			};
		}
	}

	private hasSellerNetworkInput(dto: any) {
		return (
			dto?.canRecruitSellers !== undefined ||
			dto?.sellerReferralCommissionPercent !== undefined ||
			dto?.referredByUserId !== undefined ||
			dto?.referredByCommissionPercentSnapshot !== undefined
		);
	}

	private hasMeaningfulSellerNetworkInput(dto: any) {
		const referredByUserId = Number(dto?.referredByUserId || 0);
		const sellerReferralCommissionPercent = Number(dto?.sellerReferralCommissionPercent || 0);
		const referredByCommissionPercentSnapshot = Number(dto?.referredByCommissionPercentSnapshot || 0);
		return Boolean(dto?.canRecruitSellers) ||
			referredByUserId > 0 ||
			sellerReferralCommissionPercent > 0 ||
			referredByCommissionPercentSnapshot > 0;
	}

	private sellerNetworkPayload(user: any) {
		return {
			canRecruitSellers: Boolean(user.canRegisterHbxSellers),
			sellerReferralCommissionPercent: Number(user.sellerReferralCommissionPercent || 0) || 0,
			referredByUserId: user.referredByUserId || null,
			referredByCommissionPercentSnapshot: Number(user.referredByCommissionPercentSnapshot || 0) || 0,
			referredByUser: user.referredByUser
				? {
					id: user.referredByUser.id,
					name: user.referredByUser.name || null,
					username: user.referredByUser.username || null,
					email: user.referredByUser.email || null,
				}
				: null,
		};
	}

	private async buildSellerNetworkData(input: {
		companyId: number;
		role: 'USER' | 'ADMIN';
		dto: any;
		targetUserId?: number;
		forCreate?: boolean;
	}) {
		const dto = input.dto || {};
		const hasInput = this.hasSellerNetworkInput(dto);
		const data: any = {};

		if (input.role !== 'USER') {
			if (this.hasMeaningfulSellerNetworkInput(dto)) {
				throw new BadRequestException('Rede de indicação só pode ser configurada para vendedores.');
			}
			if (input.forCreate || hasInput) {
				data.canRegisterHbxSellers = false;
				data.sellerReferralCommissionPercent = 0;
				data.referredByUserId = null;
				data.referredByCommissionPercentSnapshot = 0;
			}
			return data;
		}

		if (!hasInput && !input.forCreate) return data;

		if (dto.canRecruitSellers !== undefined || input.forCreate) {
			data.canRegisterHbxSellers = Boolean(dto.canRecruitSellers);
		}

		const referredByUserId = normalizeOptionalPositiveInt(dto.referredByUserId);
		const sellerReferralCommissionPercent = normalizeCommissionPercent(dto.sellerReferralCommissionPercent);
		if (sellerReferralCommissionPercent !== undefined || input.forCreate) {
			data.sellerReferralCommissionPercent = sellerReferralCommissionPercent ?? 0;
		}
		if (referredByUserId !== undefined) {
			if (input.targetUserId && referredByUserId === input.targetUserId) {
				throw new BadRequestException('Um vendedor não pode indicar a si mesmo.');
			}
			const referrer = await this.usersService.getActiveSellerReferrer(input.companyId, referredByUserId);
			if (!referrer) {
				throw new BadRequestException('Indicador precisa ser vendedor ativo da empresa.');
			}
			data.referredByUserId = referrer.id;
			data.sellerReferralCommissionPercent = normalizeCommissionPercent(referrer.sellerReferralCommissionPercent) ?? 0;
			data.referredByCommissionPercentSnapshot = normalizeCommissionPercent(referrer.sellerReferralCommissionPercent) ?? 0;
		} else if (dto.referredByUserId === null || dto.referredByUserId === '') {
			data.referredByUserId = null;
			data.referredByCommissionPercentSnapshot = 0;
		} else if (input.forCreate) {
			data.referredByUserId = null;
			data.referredByCommissionPercentSnapshot = 0;
		}

		return data;
	}

	// GET /users/check-username?username=foo
	@Get('check-username')
	@Throttle({ default: { limit: 30, ttl: 60 } })
	async checkUsername(@Query('username') username: string) {
		const normalized = String(username || '').trim();
		if (!normalized) return { preRegistered: false };

		const user: any = await this.usersService.findByUsername(normalized);
		const preRegistered = Boolean(
			user && (!user.email || user.email.length === 0) && (!user.password || user.password.length === 0)
		);
		return { preRegistered };
	}

	@Get('company')
	@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
	@Admin()
	@ModuleAccess('gerencial', 'webscraping')
	async listCompanyUsers(@Req() req: any) {
		const companyId = Number(req?.user?.companyId);
		if (!companyId) throw new ForbiddenException('Company context required');
		return this.usersService.listByCompany(companyId);
	}

	@Patch(':id/role')
	@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
	@Admin()
	@ModuleAccess('gerencial')
	async updateRole(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
		const companyId = Number(req?.user?.companyId);
		if (!companyId) throw new ForbiddenException('Company context required');

		const role = String(dto?.role || '').toUpperCase();
		if (role !== 'USER' && role !== 'ADMIN') {
			throw new BadRequestException('role must be USER or ADMIN');
		}

		const target = await this.usersService.findById(id);
		if (!target) throw new NotFoundException('Usuário não encontrado');
		if (Number(target.companyId) !== companyId) {
			throw new ForbiddenException('Usuário fora da sua empresa');
		}
		if (target.isSystemMaster) {
			throw new ForbiddenException('Usuário USERMASTER não pode ter perfil alterado aqui');
		}

		const updated = await this.usersService.updateById(id, {
			role,
			...(role === 'ADMIN'
				? {
					canRegisterHbxSellers: false,
					sellerReferralCommissionPercent: 0,
					referredByUserId: null,
					referredByCommissionPercentSnapshot: 0,
				}
				: {}),
		}, { actorUserId: Number(req?.user?.id || 0), action: 'role_update' });
		return {
			id: updated.id,
			username: updated.username,
			email: updated.email,
			role: updated.role,
		};
	}

	@Patch(':id/profile')
	@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
	@Admin()
	@ModuleAccess('gerencial')
	async updateCompanyUserProfile(
		@Req() req: any,
		@Param('id', ParseIntPipe) id: number,
		@Body() dto: UpdateCompanyUserProfileDto,
	) {
		const companyId = Number(req?.user?.companyId);
		if (!companyId) throw new ForbiddenException('Company context required');

		const target = await this.usersService.findById(id);
		if (!target) throw new NotFoundException('Usuário não encontrado');
		if (Number(target.companyId) !== companyId) {
			throw new ForbiddenException('Usuário fora da sua empresa');
		}
		if (target.isSystemMaster) {
			throw new ForbiddenException('Usuário MASTER não pode ser alterado por admin da empresa');
		}

		const data: any = {};
		const name = normalizeNullableText(dto.name);
		const phone = normalizeNullableText(dto.phone);
		const commissionPercent = normalizeCommissionPercent(dto.commissionPercent);
		if (name !== undefined) data.name = name;
		if (phone !== undefined) data.phone = phone;
		if (commissionPercent !== undefined) data.commissionPercent = commissionPercent;
		const sellerNetworkData = await this.buildSellerNetworkData({
			companyId,
			role: String(target.role || '').toUpperCase() === 'ADMIN' ? 'ADMIN' : 'USER',
			dto,
			targetUserId: id,
		});
		const sellerOptionsEnabled = await this.usersService.isSellerNetworkCompany(companyId);
		if (
			dto.sellerDistributionDailyLimitOverride !== undefined &&
			['USER', 'ADMIN'].includes(String(target.role || '').toUpperCase()) &&
			sellerOptionsEnabled
		) {
			data.sellerDistributionDailyLimitOverride = Math.max(0, Math.min(500, Math.trunc(Number(dto.sellerDistributionDailyLimitOverride || 0) || 0)));
		}
		const changedReferrerId = sellerNetworkData.referredByUserId
			? Number(sellerNetworkData.referredByUserId || 0)
			: 0;
		const lockedReferrerId = sellerNetworkData.referredByUserId === null
			? 0
			: Number(changedReferrerId || target.referredByUserId || 0);
		if (
			lockedReferrerId &&
			String(target.role || '').toUpperCase() !== 'ADMIN' &&
			sellerOptionsEnabled
		) {
			if (changedReferrerId) {
				const referrer = await this.usersService.getActiveSellerReferrer(companyId, lockedReferrerId);
				if (!referrer) throw new BadRequestException('Indicador precisa ser vendedor ativo da empresa.');
				data.commissionPercent = normalizeCommissionPercent(referrer.commissionPercent) ?? 0;
				data.sellerReferralCommissionPercent = normalizeCommissionPercent(referrer.sellerReferralCommissionPercent) ?? 0;
				data.referredByCommissionPercentSnapshot = normalizeCommissionPercent(referrer.sellerReferralCommissionPercent) ?? 0;
			} else {
				data.commissionPercent = normalizeCommissionPercent(target.commissionPercent) ?? 0;
				data.sellerReferralCommissionPercent = normalizeCommissionPercent(target.sellerReferralCommissionPercent) ?? 0;
				data.referredByCommissionPercentSnapshot = normalizeCommissionPercent(target.referredByCommissionPercentSnapshot) ?? 0;
			}
		}
		Object.assign(data, sellerNetworkData);

		const updated = Object.keys(data).length
			? await this.usersService.updateById(id, data, { actorUserId: Number(req?.user?.id || 0), action: 'profile_update' })
			: target;

		return {
			id: updated.id,
			name: updated.name,
			phone: updated.phone,
			commissionPercent: updated.commissionPercent,
			sellerDistributionDailyLimitOverride: updated.sellerDistributionDailyLimitOverride,
			...this.sellerNetworkPayload(updated),
		};
	}

	@Patch(':id/active')
	@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
	@Admin()
	@ModuleAccess('gerencial')
	async toggleActive(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: ToggleActiveDto) {
		const companyId = Number(req?.user?.companyId);
		const requesterId = Number(req?.user?.id);
		if (!companyId) throw new ForbiddenException('Company context required');

		const target = await this.usersService.findById(id);
		if (!target) throw new NotFoundException('Usuário não encontrado');
		if (Number(target.companyId) !== companyId) {
			throw new ForbiddenException('Usuário fora da sua empresa');
		}
		if (target.isSystemMaster) {
			throw new ForbiddenException('Usuário MASTER não pode ser alterado por admin da empresa');
		}
		if (requesterId === id) {
			throw new BadRequestException('Você não pode remover seu próprio acesso.');
		}

		const nextActive = typeof dto?.active === 'boolean' ? dto.active : !Boolean(target.isActive);

		if (!nextActive) {
			const updated = await this.usersService.deactivateUser(id, 730, { actorUserId: requesterId, action: 'deactivate' });
			return {
				id: updated.id,
				isActive: updated.isActive,
				deactivatedAt: updated.deactivatedAt,
				retentionUntil: updated.retentionUntil,
				message: 'Usuário desativado com sucesso, manteremos histórico por 730 dias',
			};
		}

		let welcomeEmail: Pick<MailSendResult, 'ok' | 'transport' | 'messageId' | 'errorCode' | 'errorMessage'> | null = null;
		let confirmationEmail: (Pick<MailSendResult, 'ok' | 'transport' | 'messageId' | 'errorCode' | 'errorMessage'> & { previewUrl?: string | null; confirmUrl?: string | null }) | null = null;
		const sellerOptionsEnabled = await this.usersService.isSellerNetworkCompany(companyId);
		const isSellerOnboardingActivation =
			sellerOptionsEnabled &&
			String(target.role || '').toUpperCase() === 'USER' &&
			target.isActive === false &&
			await this.sellerOnboardingService.hasOnboardingForUser(companyId, id);
		let finalTemporaryPassword: string | null = null;
		if (isSellerOnboardingActivation) {
			await this.sellerOnboardingService.assertCanActivatePartner(companyId, id, requesterId);
			finalTemporaryPassword = `Hbx@${Math.random().toString(36).slice(2, 10)}A1`;
			assertPasswordPolicy(finalTemporaryPassword);
			await this.usersService.setPassword(id, await bcrypt.hash(finalTemporaryPassword, 10), { mustChangePassword: true });
		}

		const updated = await this.usersService.reactivateUser(id);
		if (isSellerOnboardingActivation && finalTemporaryPassword) {
			welcomeEmail = await this.sendWelcomeAccessEmail({
				email: updated.email || updated.username || '',
				login: updated.username || updated.email || '',
				password: finalTemporaryPassword,
				name: updated.name,
				role: 'USER',
				source: 'seller_onboarding_activation',
				companyId,
				commissionPercent: updated.commissionPercent,
				sellerReferralCommissionPercent: updated.sellerReferralCommissionPercent,
				referredByCommissionPercentSnapshot: updated.referredByCommissionPercentSnapshot,
			});
		}
		return {
			id: updated.id,
			isActive: updated.isActive,
			deactivatedAt: updated.deactivatedAt,
			retentionUntil: updated.retentionUntil,
			message: isSellerOnboardingActivation
				? 'Vendedor liberado e e-mail de boas-vindas enviado.'
				: 'Usuário reativado com sucesso',
			welcomeEmail,
			confirmationEmail,
		};
	}

	@Delete(':id/delete')
	@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
	@Admin()
	@ModuleAccess('gerencial')
	async deleteCompanyUser(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
		const companyId = Number(req?.user?.companyId);
		if (!companyId) throw new ForbiddenException('Company context required');

		const target = await this.usersService.findById(id);
		if (!target) throw new NotFoundException('Usuário não encontrado');
		if (Number(target.companyId) !== companyId) {
			throw new ForbiddenException('Usuário fora da sua empresa');
		}
		if (target.isSystemMaster) {
			throw new ForbiddenException('Usuário MASTER não pode ser removido por admin da empresa');
		}

		await this.usersService.hardDeleteUser(id, { actorUserId: Number(req?.user?.id || 0), action: 'delete' });
		return {
			ok: true,
			id,
			message: 'Usuário excluído definitivamente.',
		};
	}

	@Post('company/create')
	@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
	@Admin()
	@ModuleAccess('gerencial')
	async createCompanyUser(@Req() req: any, @Body() dto: CreateCompanyUserDto) {
		const companyId = Number(req?.user?.companyId);
		if (!companyId) throw new ForbiddenException('Company context required');

		const role = (dto.role === 'ADMIN' ? 'ADMIN' : 'USER') as 'USER' | 'ADMIN';
		const seatUsage = await this.usersService.getCompanyTrialSeatUsage(companyId);
		const sellerOptionsEnabled = await this.usersService.isSellerNetworkCompany(companyId);
		if (!seatUsage.company) throw new NotFoundException('Empresa não encontrada');
		if (seatUsage.isTrial && role === 'ADMIN' && seatUsage.activeAdmins >= seatUsage.maxAdmins) {
			throw new BadRequestException('O free trial permite 1 admin ativo por empresa.');
		}
		if (seatUsage.isTrial && role === 'USER' && seatUsage.activeSellers >= seatUsage.maxSellers) {
			throw new BadRequestException('O free trial permite no máximo 2 vendedores ativos por empresa.');
		}

		const email = String(dto?.email || '').trim().toLowerCase();
		if (!email) throw new BadRequestException('email is required');

		const existing = await this.usersService.findByEmail(email);
		if (existing) throw new BadRequestException('E-mail já cadastrado');
		const existingUsername = await this.usersService.findByUsername(email);
		if (existingUsername) throw new BadRequestException('Username já cadastrado');

		const referralCandidateId = String(dto.referralCandidateId || '').trim();
		const referralCandidate = referralCandidateId
			? await this.hbxPartnerReferrals.getCandidateForConversion(companyId, referralCandidateId)
			: null;
		if (referralCandidateId && (!referralCandidate || role !== 'USER' || !sellerOptionsEnabled)) {
			throw new BadRequestException('Indicação inválida para cadastro de vendedor.');
		}
		if (referralCandidate && dto.referredByUserId && Number(dto.referredByUserId) !== Number(referralCandidate.referrerUserId)) {
			throw new BadRequestException('A indicação já define outro vendedor indicador.');
		}
		const tempPassword = dto.password?.trim() || `Tmp@${Math.random().toString(36).slice(2, 10)}A1`;
		const hashed = await bcrypt.hash(tempPassword, 10);
		assertPasswordPolicy(tempPassword);

		const attendantName = String(dto?.name || referralCandidate?.candidateName || '').trim();
		const phone = normalizeNullableText(dto.phone) || normalizeNullableText(referralCandidate?.candidatePhone);
		let commissionPercent = normalizeCommissionPercent(dto.commissionPercent) ?? 0;
		const sellerNetworkDto = referralCandidate
			? { ...dto, referredByUserId: referralCandidate.referrerUserId }
			: dto;
		const sellerNetworkData = await this.buildSellerNetworkData({
			companyId,
			role,
			dto: sellerNetworkDto,
			forCreate: true,
		});
		let selectedReferrer: Awaited<ReturnType<UsersService['getActiveSellerReferrer']>> | null = null;
		if (role === 'USER' && sellerNetworkData.referredByUserId) {
			selectedReferrer = await this.usersService.getActiveSellerReferrer(companyId, sellerNetworkData.referredByUserId);
			commissionPercent = normalizeCommissionPercent(selectedReferrer?.commissionPercent) ?? commissionPercent;
		}
		const requiresSellerOnboarding = Boolean(
			role === 'USER' &&
				(dto.requiresSellerOnboarding ||
					referralCandidate ||
					normalizeNullableText(dto.cpf) ||
					normalizeNullableText(dto.declaredAddress)),
		);
		const created = await this.usersService.create({
			email,
			username: email,
			name: attendantName || undefined,
			phone,
			commissionPercent,
			...sellerNetworkData,
			password: hashed,
			mustChangePassword: true,
			companyId,
			role,
			...((role === 'USER' || role === 'ADMIN') && sellerOptionsEnabled && dto.sellerDistributionDailyLimitOverride !== undefined
				? { sellerDistributionDailyLimitOverride: Math.max(0, Math.min(500, Math.trunc(Number(dto.sellerDistributionDailyLimitOverride || 0) || 0))) }
				: {}),
			...(requiresSellerOnboarding ? { isActive: false } : {}),
		});
		let welcomeEmail: Pick<MailSendResult, 'ok' | 'transport' | 'messageId' | 'errorCode' | 'errorMessage'> | null = null;
		let onboardingEmail: any = null;
		if (requiresSellerOnboarding) {
			const createdByUserId = Number(req?.user?.id || 0) || null;
			await this.sellerOnboardingService.getOrCreateForUser(companyId, created.id, createdByUserId);
			await this.sellerOnboardingService.updateDraft(companyId, created.id, {
				legalName: attendantName || created.name || '',
				email,
				phone,
				cpf: dto.cpf,
				declaredAddress: dto.declaredAddress,
				commissionPercent: created.commissionPercent,
				commissionDueBusinessDays: dto.commissionDueBusinessDays ?? seatUsage.company.commissionDueBusinessDays,
				canRecruitSellers: created.canRegisterHbxSellers,
				sellerReferralCommissionPercent: created.sellerReferralCommissionPercent,
				referredByUserId: created.referredByUserId,
				referredByCommissionPercentSnapshot: created.referredByCommissionPercentSnapshot,
			});
			if (referralCandidate) {
				await this.hbxPartnerReferrals.markCandidateConverted({
					companyId,
					candidateId: referralCandidate.id,
					convertedUserId: created.id,
					reviewedByUserId: createdByUserId,
				});
			}
		} else {
			welcomeEmail = await this.sendWelcomeAccessEmail({
				email,
				login: email,
				password: tempPassword,
				name: attendantName || created.name,
				role,
				source: 'company_create',
				companyId,
				commissionPercent: created.commissionPercent,
				sellerReferralCommissionPercent: created.sellerReferralCommissionPercent,
				referredByCommissionPercentSnapshot: created.referredByCommissionPercentSnapshot,
			});
		}

		return {
			user: {
				id: created.id,
				email: created.email,
				username: created.username,
				name: created.name,
				phone: created.phone,
				commissionPercent: created.commissionPercent,
				role: created.role,
				isSystemMaster: created.isSystemMaster,
				isActive: created.isActive,
				sellerDistributionDailyLimitOverride: (created as any).sellerDistributionDailyLimitOverride,
				...this.sellerNetworkPayload(created),
			},
			temporaryPassword: requiresSellerOnboarding ? null : dto.password ? null : tempPassword,
			welcomeEmail,
			onboardingEmail,
		};
	}

	@Post('hbx/referred-seller')
	@UseGuards(JwtAuthGuard)
	async createHbxReferredSeller(@Req() req: any, @Body() dto: CreateReferredSellerDto) {
		const requesterId = Number(req?.user?.id || 0);
		const requester = requesterId ? await this.usersService.findById(requesterId) : null;
		if (!requester) throw new ForbiddenException('Usuário não identificado');
		const companyId = Number(requester.companyId || 0);
		if (!companyId || !(await this.usersService.isSellerNetworkCompany(companyId))) {
			throw new ForbiddenException('Cadastro por indicação está disponível apenas para vendedores de empresas tenant.');
		}
		if (
			String(requester.role || '').toUpperCase() !== 'USER' ||
			!requester.isActive ||
			requester.deactivatedAt ||
			requester.isSystemMaster
		) {
			throw new ForbiddenException('Seu usuário ainda não está autorizado a indicar vendedores.');
		}

		const candidate = await this.hbxPartnerReferrals.createCandidate(requester, {
			candidateName: normalizeNullableText(dto.name),
			candidatePhone: normalizeNullableText(dto.phone),
			note: normalizeNullableText(dto.note),
			preferredSegmentsJson: buildPreferredSegmentsJson(dto),
		});

		return {
			ok: true,
			message: 'Indicação enviada para aprovação do administrador.',
			candidate,
		};
	}

	@Get('hbx/referral-candidates')
	@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
	@Admin()
	@ModuleAccess('gerencial')
	async listHbxReferralCandidates(@Req() req: any, @Query('status') status?: string) {
		const companyId = Number(req?.user?.companyId || 0);
		if (!companyId || !(await this.usersService.isSellerNetworkCompany(companyId))) {
			return { candidates: [] };
		}
		const candidates = status && status !== 'pending'
			? await this.usersService.listHbxPartnerReferralCandidates(companyId, status)
			: await this.hbxPartnerReferrals.listPendingForMaster(req.user);
		return { candidates };
	}

	@Get('hbx/referral-candidates/lookup-phone')
	@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
	@Admin()
	@ModuleAccess('gerencial')
	async lookupHbxReferralCandidateByPhone(@Req() req: any, @Query('phone') phone?: string) {
		const companyId = Number(req?.user?.companyId || 0);
		if (!companyId || !(await this.usersService.isSellerNetworkCompany(companyId))) {
			return { found: false, candidate: null, referrer: null };
		}
		const candidate = await this.hbxPartnerReferrals.findCandidateByPhone(companyId, phone);
		return {
			found: Boolean(candidate),
			candidate,
			referrer: candidate?.referrerUser || null,
		};
	}

	@Post('hbx/referral-candidates/:id/reject')
	@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
	@Admin()
	@ModuleAccess('gerencial')
	async rejectHbxReferralCandidate(@Req() req: any, @Param('id') id: string) {
		const companyId = Number(req?.user?.companyId || 0);
		if (!companyId || !(await this.usersService.isSellerNetworkCompany(companyId))) {
			throw new ForbiddenException('Aprovação de indicações está disponível apenas para empresas tenant.');
		}
		const candidate = await this.hbxPartnerReferrals.rejectCandidate(req.user, id, null);
		return { candidate };
	}

	@Post('hbx/referral-candidates/:id/approve')
	@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
	@Admin()
	@ModuleAccess('gerencial')
	async approveHbxReferralCandidate(@Req() req: any, @Param('id') id: string) {
		const companyId = Number(req?.user?.companyId || 0);
		if (!companyId || !(await this.usersService.isSellerNetworkCompany(companyId))) {
			throw new ForbiddenException('Aprovação de indicações está disponível apenas para empresas tenant.');
		}
		const candidate = await this.hbxPartnerReferrals.approveCandidate(req.user, id);
		return { candidate };
	}

	@Patch('master/:id/delete')
	@UseGuards(JwtAuthGuard, MasterGuard)
	async masterDeleteUser(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
		const target = await this.usersService.findById(id);
		if (!target) throw new NotFoundException('Usuário não encontrado');
		if (target.isSystemMaster) throw new ForbiddenException('Usuário MASTER não pode ser removido');

		await this.usersService.hardDeleteUser(id, { actorUserId: Number(req.user?.id || 0), action: 'delete' });
		await this.masterContextService.registerSupportAction({
			masterUserId: Number(req.user?.id),
			companyId: Number(target.companyId || 0) || null,
			scope: 'master_user',
			action: 'USER_DELETED',
			severity: 'WARN',
			metadata: {
				userId: id,
				email: target.email || null,
				username: target.username || null,
			},
		});
		return { ok: true, id };
	}

	@Post('master/company/:companyId/create')
	@UseGuards(JwtAuthGuard, MasterGuard)
	async masterCreateCompanyUser(
		@Req() req: any,
		@Param('companyId', ParseIntPipe) companyId: number,
		@Body() dto: MasterCreateUserDto,
	) {
		const role = (dto.role === 'ADMIN' ? 'ADMIN' : 'USER') as 'USER' | 'ADMIN';
		const seatUsage = await this.usersService.getCompanyTrialSeatUsage(companyId);
		const sellerOptionsEnabled = await this.usersService.isSellerNetworkCompany(companyId);
		if (!seatUsage.company) throw new NotFoundException('Empresa não encontrada');
		if (seatUsage.isTrial && role === 'ADMIN' && seatUsage.activeAdmins >= seatUsage.maxAdmins) {
			throw new BadRequestException('O free trial permite 1 admin ativo por empresa.');
		}
		if (seatUsage.isTrial && role === 'USER' && seatUsage.activeSellers >= seatUsage.maxSellers) {
			throw new BadRequestException('O free trial permite no máximo 2 vendedores ativos por empresa.');
		}

		const email = String(dto?.email || '').trim().toLowerCase();
		if (!email) throw new BadRequestException('email is required');

		const existingEmail = await this.usersService.findByEmail(email);
		if (existingEmail) throw new BadRequestException('E-mail já cadastrado');

		const username = String(dto?.username || '').trim();
		const loginUsername = username || email;
		const existingUsername = await this.usersService.findByUsername(loginUsername);
		if (existingUsername) throw new BadRequestException('Username já cadastrado');

		const referralCandidateId = String(dto.referralCandidateId || '').trim();
		const referralCandidate = referralCandidateId
			? await this.hbxPartnerReferrals.getCandidateForConversion(companyId, referralCandidateId)
			: null;
		if (referralCandidateId && (!referralCandidate || role !== 'USER' || !sellerOptionsEnabled)) {
			throw new BadRequestException('Indicação inválida para cadastro de vendedor.');
		}
		if (referralCandidate && dto.referredByUserId && Number(dto.referredByUserId) !== Number(referralCandidate.referrerUserId)) {
			throw new BadRequestException('A indicação já define outro vendedor indicador.');
		}
		const attendantName = String(dto?.name || referralCandidate?.candidateName || '').trim();
		const tempPassword = dto.password?.trim() || `Tmp@${Math.random().toString(36).slice(2, 10)}A1`;
		assertPasswordPolicy(tempPassword);
		const hashed = await bcrypt.hash(tempPassword, 10);
		const phone = normalizeNullableText(dto.phone) || normalizeNullableText(referralCandidate?.candidatePhone);
		let commissionPercent = normalizeCommissionPercent(dto.commissionPercent) ?? 0;
		const sellerNetworkDto = referralCandidate
			? { ...dto, referredByUserId: referralCandidate.referrerUserId }
			: dto;
		const sellerNetworkData = await this.buildSellerNetworkData({
			companyId,
			role,
			dto: sellerNetworkDto,
			forCreate: true,
		});
		let selectedReferrer: Awaited<ReturnType<UsersService['getActiveSellerReferrer']>> | null = null;
		if (role === 'USER' && sellerNetworkData.referredByUserId) {
			selectedReferrer = await this.usersService.getActiveSellerReferrer(companyId, sellerNetworkData.referredByUserId);
			commissionPercent = normalizeCommissionPercent(selectedReferrer?.commissionPercent) ?? commissionPercent;
		}
		const requiresSellerOnboarding = Boolean(
			role === 'USER' &&
				(dto.requiresSellerOnboarding ||
					referralCandidate ||
					normalizeNullableText(dto.cpf) ||
					normalizeNullableText(dto.declaredAddress)),
		);

		const created = await this.usersService.create({
			email,
			username: loginUsername,
			name: attendantName || undefined,
			phone,
			commissionPercent,
			...sellerNetworkData,
			password: hashed,
			mustChangePassword: true,
			companyId,
			role,
			...(requiresSellerOnboarding ? { isActive: false } : {}),
		});
		let welcomeEmail: Pick<MailSendResult, 'ok' | 'transport' | 'messageId' | 'errorCode' | 'errorMessage'> | null = null;
		let onboardingEmail: any = null;
		if (requiresSellerOnboarding) {
			const createdByUserId = Number(req?.user?.id || 0) || null;
			await this.sellerOnboardingService.getOrCreateForUser(companyId, created.id, createdByUserId);
			await this.sellerOnboardingService.updateDraft(companyId, created.id, {
				legalName: attendantName || created.name || '',
				email,
				phone,
				cpf: dto.cpf,
				declaredAddress: dto.declaredAddress,
				commissionPercent: created.commissionPercent,
				commissionDueBusinessDays: dto.commissionDueBusinessDays ?? seatUsage.company.commissionDueBusinessDays,
				canRecruitSellers: created.canRegisterHbxSellers,
				sellerReferralCommissionPercent: created.sellerReferralCommissionPercent,
				referredByUserId: created.referredByUserId,
				referredByCommissionPercentSnapshot: created.referredByCommissionPercentSnapshot,
			});
			if (referralCandidate) {
				await this.hbxPartnerReferrals.markCandidateConverted({
					companyId,
					candidateId: referralCandidate.id,
					convertedUserId: created.id,
					reviewedByUserId: createdByUserId,
				});
			}
		} else {
			welcomeEmail = await this.sendWelcomeAccessEmail({
				email,
				login: loginUsername,
				password: tempPassword,
				name: attendantName || created.name,
				role,
				source: 'master_company_create',
				companyId,
				commissionPercent: created.commissionPercent,
				sellerReferralCommissionPercent: created.sellerReferralCommissionPercent,
				referredByCommissionPercentSnapshot: created.referredByCommissionPercentSnapshot,
			});
		}

		await this.masterContextService.registerSupportAction({
			masterUserId: Number(req.user?.id),
			companyId,
			scope: 'master_user',
			action: 'USER_CREATED',
			metadata: {
				userId: created.id,
				email: created.email,
				username: created.username || null,
				name: created.name || null,
				phone: created.phone || null,
				commissionPercent: created.commissionPercent,
				...this.sellerNetworkPayload(created),
				role: created.role,
			},
		});

		return {
			user: {
				id: created.id,
				email: created.email,
				username: created.username,
				name: created.name,
				phone: created.phone,
				commissionPercent: created.commissionPercent,
				role: created.role,
				isSystemMaster: created.isSystemMaster,
				isActive: created.isActive,
				...this.sellerNetworkPayload(created),
			},
			temporaryPassword: requiresSellerOnboarding ? null : dto.password ? null : tempPassword,
			welcomeEmail,
			onboardingEmail,
		};
	}

	@Patch('master/:id')
	@UseGuards(JwtAuthGuard, MasterGuard)
	async masterEditUser(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: MasterEditUserDto) {
		const target = await this.usersService.findById(id);
		if (!target) throw new NotFoundException('Usuário não encontrado');
		if (target.isSystemMaster) throw new ForbiddenException('Usuário MASTER não pode ser alterado');

		const data: any = {};

		if (typeof dto.email === 'string') {
			const email = dto.email.trim().toLowerCase();
			if (!email) throw new BadRequestException('E-mail inválido');
			const existing = await this.usersService.findByEmail(email);
			if (existing && existing.id !== id) throw new BadRequestException('E-mail já cadastrado');
			data.email = email;
		}

		if (typeof dto.username === 'string') {
			const username = dto.username.trim();
			if (username) {
				const existing = await this.usersService.findByUsername(username);
				if (existing && existing.id !== id) throw new BadRequestException('Username já cadastrado');
				data.username = username;
			} else {
				data.username = null;
			}
		}

		if (typeof dto.name === 'string') {
			data.name = dto.name.trim() || null;
		}

		const phone = normalizeNullableText(dto.phone);
		if (phone !== undefined) {
			data.phone = phone;
		}

		const commissionPercent = normalizeCommissionPercent(dto.commissionPercent);
		if (commissionPercent !== undefined) {
			data.commissionPercent = commissionPercent;
		}

		if (typeof dto.role === 'string') {
			const role = String(dto.role).toUpperCase();
			data.role = role === 'ADMIN' ? 'ADMIN' : 'USER';
		}

		const nextRole = (data.role || target.role) === 'ADMIN' ? 'ADMIN' : 'USER';
		if (data.role === 'ADMIN') {
			Object.assign(data, {
				canRegisterHbxSellers: false,
				sellerReferralCommissionPercent: 0,
				referredByUserId: null,
				referredByCommissionPercentSnapshot: 0,
			});
		}
		const sellerNetworkData = await this.buildSellerNetworkData({
			companyId: Number(target.companyId || 0),
			role: nextRole,
			dto,
			targetUserId: id,
		});
		const changedReferrerId = sellerNetworkData.referredByUserId
			? Number(sellerNetworkData.referredByUserId || 0)
			: 0;
		const lockedReferrerId = sellerNetworkData.referredByUserId === null
			? 0
			: Number(changedReferrerId || target.referredByUserId || 0);
		if (
			lockedReferrerId &&
			nextRole === 'USER' &&
			await this.usersService.isSellerNetworkCompany(Number(target.companyId || 0))
		) {
			if (changedReferrerId) {
				const referrer = await this.usersService.getActiveSellerReferrer(Number(target.companyId || 0), lockedReferrerId);
				if (!referrer) throw new BadRequestException('Indicador precisa ser vendedor ativo da empresa.');
				data.commissionPercent = normalizeCommissionPercent(referrer.commissionPercent) ?? 0;
				data.sellerReferralCommissionPercent = normalizeCommissionPercent(referrer.sellerReferralCommissionPercent) ?? 0;
				data.referredByCommissionPercentSnapshot = normalizeCommissionPercent(referrer.sellerReferralCommissionPercent) ?? 0;
			} else {
				data.commissionPercent = normalizeCommissionPercent(target.commissionPercent) ?? 0;
				data.sellerReferralCommissionPercent = normalizeCommissionPercent(target.sellerReferralCommissionPercent) ?? 0;
				data.referredByCommissionPercentSnapshot = normalizeCommissionPercent(target.referredByCommissionPercentSnapshot) ?? 0;
			}
		}
		Object.assign(data, sellerNetworkData);

		if (typeof dto.isActive === 'boolean') {
			if (!dto.isActive) {
				data.isActive = false;
				data.deactivatedAt = new Date();
				data.retentionUntil = new Date(Date.now() + 730 * 24 * 60 * 60 * 1000);
			} else {
				const hasSellerOnboarding = await this.sellerOnboardingService.hasOnboardingForUser(Number(target.companyId || 0), id);
				if (hasSellerOnboarding && nextRole === 'USER' && target.isActive === false) {
					await this.sellerOnboardingService.assertCanActivatePartner(Number(target.companyId || 0), id, Number(req.user?.id || 0) || null);
				}
				data.isActive = true;
				data.deactivatedAt = null;
				data.retentionUntil = null;
			}
		}

		const updated = await this.usersService.updateById(id, data, { actorUserId: Number(req.user?.id || 0), action: 'profile_update' });
		await this.masterContextService.registerSupportAction({
			masterUserId: Number(req.user?.id),
			companyId: Number(updated.companyId || 0) || null,
			scope: 'master_user',
			action: 'USER_UPDATED',
			metadata: {
				userId: updated.id,
				email: updated.email || null,
				username: updated.username || null,
				name: updated.name || null,
				phone: updated.phone || null,
				commissionPercent: updated.commissionPercent,
				...this.sellerNetworkPayload(updated),
				role: updated.role,
				isActive: updated.isActive,
			},
		});
		return {
			id: updated.id,
			email: updated.email,
			username: updated.username,
			name: updated.name,
			phone: updated.phone,
			commissionPercent: updated.commissionPercent,
			...this.sellerNetworkPayload(updated),
			role: updated.role,
			isActive: updated.isActive,
			deactivatedAt: updated.deactivatedAt,
			retentionUntil: updated.retentionUntil,
		};
	}

	@Patch('master/:id/reset-password')
	@UseGuards(JwtAuthGuard, MasterGuard)
	async masterResetPassword(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: MasterResetPasswordDto) {
		const target = await this.usersService.findById(id);
		if (!target) throw new NotFoundException('Usuário não encontrado');
		if (target.isSystemMaster) throw new ForbiddenException('Usuário MASTER não pode ter senha resetada aqui');

		const tempPassword = dto.password?.trim() || `Tmp@${Math.random().toString(36).slice(2, 10)}A1`;
		assertPasswordPolicy(tempPassword);
		const hashed = await bcrypt.hash(tempPassword, 10);
		await this.usersService.setPassword(id, hashed, { mustChangePassword: true });
		await this.masterContextService.registerSupportAction({
			masterUserId: Number(req.user?.id),
			companyId: Number(target.companyId || 0) || null,
			scope: 'master_user',
			action: 'USER_PASSWORD_RESET',
			severity: 'WARN',
			metadata: {
				userId: id,
				email: target.email || null,
				username: target.username || null,
			},
		});

		return {
			ok: true,
			id,
			temporaryPassword: tempPassword,
		};
	}
}
