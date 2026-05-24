import { Controller, Get, Query, NotFoundException, UseGuards, Req, Patch, Param, ParseIntPipe, Body, BadRequestException, ForbiddenException, Post } from '@nestjs/common';
import { UsersService } from './users.service';
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
	canRegisterHbxSellers?: boolean;

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
	@MinLength(8)
	password?: string;

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
	canRegisterHbxSellers?: boolean;

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
	canRegisterHbxSellers?: boolean;

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
	@IsString()
	@MinLength(8)
	password?: string;
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
	canRegisterHbxSellers?: boolean;

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
	@IsEmail()
	email!: string;

	@IsOptional()
	@IsString()
	name?: string;

	@IsOptional()
	@IsString()
	phone?: string;

	@IsOptional()
	@IsString()
	@MinLength(8)
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

@Controller('users')
export class UsersController {
	constructor(
		private readonly usersService: UsersService,
		private readonly masterContextService: MasterContextService,
	) {}

	private hasSellerNetworkInput(dto: any) {
		return (
			dto?.canRegisterHbxSellers !== undefined ||
			dto?.sellerReferralCommissionPercent !== undefined ||
			dto?.referredByUserId !== undefined ||
			dto?.referredByCommissionPercentSnapshot !== undefined
		);
	}

	private hasMeaningfulSellerNetworkInput(dto: any) {
		const referredByUserId = Number(dto?.referredByUserId || 0);
		const sellerReferralCommissionPercent = Number(dto?.sellerReferralCommissionPercent || 0);
		const referredByCommissionPercentSnapshot = Number(dto?.referredByCommissionPercentSnapshot || 0);
		return Boolean(dto?.canRegisterHbxSellers) ||
			referredByUserId > 0 ||
			sellerReferralCommissionPercent > 0 ||
			referredByCommissionPercentSnapshot > 0;
	}

	private sellerNetworkPayload(user: any) {
		return {
			canRegisterHbxSellers: Boolean(user.canRegisterHbxSellers),
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
				throw new BadRequestException('Rede de indicação HBX só pode ser configurada para vendedores.');
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

		const isHbxNetwork = await this.usersService.isHbxSellerNetworkCompany(input.companyId);
		if (!isHbxNetwork) {
			if (this.hasMeaningfulSellerNetworkInput(dto)) {
				throw new BadRequestException('Rede de indicação de vendedores está disponível apenas para a operação HBX.');
			}
			if (input.forCreate) {
				data.canRegisterHbxSellers = false;
				data.sellerReferralCommissionPercent = 0;
				data.referredByUserId = null;
				data.referredByCommissionPercentSnapshot = 0;
			}
			return data;
		}

		if (dto.canRegisterHbxSellers !== undefined || input.forCreate) {
			data.canRegisterHbxSellers = Boolean(dto.canRegisterHbxSellers);
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
				throw new BadRequestException('Indicador precisa ser vendedor ativo e autorizado a cadastrar vendedores HBX.');
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
	@ModuleAccess('gerencial')
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
		});
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
		const changedReferrerId = sellerNetworkData.referredByUserId
			? Number(sellerNetworkData.referredByUserId || 0)
			: 0;
		const lockedReferrerId = sellerNetworkData.referredByUserId === null
			? 0
			: Number(changedReferrerId || target.referredByUserId || 0);
		if (
			lockedReferrerId &&
			String(target.role || '').toUpperCase() !== 'ADMIN' &&
			await this.usersService.isHbxSellerNetworkCompany(companyId)
		) {
			if (changedReferrerId) {
				const referrer = await this.usersService.getActiveSellerReferrer(companyId, lockedReferrerId);
				if (!referrer) throw new BadRequestException('Indicador precisa ser vendedor ativo e autorizado a cadastrar vendedores HBX.');
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
			? await this.usersService.updateById(id, data)
			: target;

		return {
			id: updated.id,
			name: updated.name,
			phone: updated.phone,
			commissionPercent: updated.commissionPercent,
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
			throw new BadRequestException('Você não pode desativar sua própria conta');
		}

		const nextActive = typeof dto?.active === 'boolean' ? dto.active : !Boolean(target.isActive);

		if (!nextActive) {
			const updated = await this.usersService.deactivateUser(id, 730);
			return {
				id: updated.id,
				isActive: updated.isActive,
				deactivatedAt: updated.deactivatedAt,
				retentionUntil: updated.retentionUntil,
				message: 'Funcionário Desativado com Sucesso, manteremos histórico por 730 Dias',
			};
		}

		const updated = await this.usersService.reactivateUser(id);
		return {
			id: updated.id,
			isActive: updated.isActive,
			deactivatedAt: updated.deactivatedAt,
			retentionUntil: updated.retentionUntil,
			message: 'Funcionário reativado com sucesso',
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

		if (role === 'ADMIN' && await this.usersService.isHbxSellerNetworkCompany(companyId)) {
			throw new BadRequestException('Na operação HBX, o Gerencial cadastra apenas vendedores SellMaster.');
		}
		const tempPassword = dto.password?.trim() || `Tmp@${Math.random().toString(36).slice(2, 10)}A1`;
		const hashed = await bcrypt.hash(tempPassword, 10);
		assertPasswordPolicy(tempPassword);

		const attendantName = String(dto?.name || '').trim();
		const phone = normalizeNullableText(dto.phone);
		let commissionPercent = normalizeCommissionPercent(dto.commissionPercent) ?? 0;
		const sellerNetworkData = await this.buildSellerNetworkData({
			companyId,
			role,
			dto,
			forCreate: true,
		});
		if (role === 'USER' && sellerNetworkData.referredByUserId) {
			const referrer = await this.usersService.getActiveSellerReferrer(companyId, sellerNetworkData.referredByUserId);
			commissionPercent = normalizeCommissionPercent(referrer?.commissionPercent) ?? commissionPercent;
		}
		const created = await this.usersService.create({
			email,
			username: email,
			name: attendantName || undefined,
			phone,
			commissionPercent,
			...sellerNetworkData,
			password: hashed,
			companyId,
			role,
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
			temporaryPassword: dto.password ? null : tempPassword,
		};
	}

	@Post('hbx/referred-seller')
	@UseGuards(JwtAuthGuard)
	async createHbxReferredSeller(@Req() req: any, @Body() dto: CreateReferredSellerDto) {
		const requesterId = Number(req?.user?.id || 0);
		const requester = requesterId ? await this.usersService.findById(requesterId) : null;
		if (!requester) throw new ForbiddenException('Usuário não identificado');
		const companyId = Number(requester.companyId || 0);
		if (!companyId || !(await this.usersService.isHbxSellerNetworkCompany(companyId))) {
			throw new ForbiddenException('Cadastro por indicação está disponível apenas para vendedores HBX.');
		}
		if (
			String(requester.role || '').toUpperCase() !== 'USER' ||
			!requester.isActive ||
			requester.deactivatedAt ||
			requester.isSystemMaster ||
			!requester.canRegisterHbxSellers
		) {
			throw new ForbiddenException('Seu usuário ainda não está autorizado a cadastrar vendedores HBX.');
		}

		const email = String(dto?.email || '').trim().toLowerCase();
		if (!email) throw new BadRequestException('email is required');
		if (await this.usersService.findByEmail(email)) throw new BadRequestException('E-mail já cadastrado');
		if (await this.usersService.findByUsername(email)) throw new BadRequestException('Username já cadastrado');

		const tempPassword = dto.password?.trim() || `Tmp@${Math.random().toString(36).slice(2, 10)}A1`;
		assertPasswordPolicy(tempPassword);
		const hashed = await bcrypt.hash(tempPassword, 10);
		const attendantName = String(dto?.name || '').trim();
		const phone = normalizeNullableText(dto.phone);
		const inheritedSnapshot = normalizeCommissionPercent(requester.sellerReferralCommissionPercent) ?? 0;

		const created = await this.usersService.create({
			email,
			username: email,
			name: attendantName || undefined,
			phone,
			commissionPercent: normalizeCommissionPercent(requester.commissionPercent) ?? 0,
			canRegisterHbxSellers: false,
			sellerReferralCommissionPercent: inheritedSnapshot,
			referredByUserId: requester.id,
			referredByCommissionPercentSnapshot: inheritedSnapshot,
			password: hashed,
			companyId,
			role: 'USER',
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
			temporaryPassword: dto.password ? null : tempPassword,
		};
	}

	@Patch('master/:id/delete')
	@UseGuards(JwtAuthGuard, MasterGuard)
	async masterDeleteUser(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
		const target = await this.usersService.findById(id);
		if (!target) throw new NotFoundException('Usuário não encontrado');
		if (target.isSystemMaster) throw new ForbiddenException('Usuário MASTER não pode ser removido');

		await this.usersService.hardDeleteUser(id);
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
		const attendantName = String(dto?.name || '').trim();
		const existingUsername = await this.usersService.findByUsername(loginUsername);
		if (existingUsername) throw new BadRequestException('Username já cadastrado');

		const tempPassword = dto.password?.trim() || `Tmp@${Math.random().toString(36).slice(2, 10)}A1`;
		assertPasswordPolicy(tempPassword);
		const hashed = await bcrypt.hash(tempPassword, 10);
		const phone = normalizeNullableText(dto.phone);
		let commissionPercent = normalizeCommissionPercent(dto.commissionPercent) ?? 0;
		const sellerNetworkData = await this.buildSellerNetworkData({
			companyId,
			role,
			dto,
			forCreate: true,
		});
		if (role === 'USER' && sellerNetworkData.referredByUserId) {
			const referrer = await this.usersService.getActiveSellerReferrer(companyId, sellerNetworkData.referredByUserId);
			commissionPercent = normalizeCommissionPercent(referrer?.commissionPercent) ?? commissionPercent;
		}

		const created = await this.usersService.create({
			email,
			username: loginUsername,
			name: attendantName || undefined,
			phone,
			commissionPercent,
			...sellerNetworkData,
			password: hashed,
			companyId,
			role,
		});

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
			temporaryPassword: dto.password ? null : tempPassword,
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
			await this.usersService.isHbxSellerNetworkCompany(Number(target.companyId || 0))
		) {
			if (changedReferrerId) {
				const referrer = await this.usersService.getActiveSellerReferrer(Number(target.companyId || 0), lockedReferrerId);
				if (!referrer) throw new BadRequestException('Indicador precisa ser vendedor ativo e autorizado a cadastrar vendedores HBX.');
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
				data.isActive = true;
				data.deactivatedAt = null;
				data.retentionUntil = null;
			}
		}

		const updated = await this.usersService.updateById(id, data);
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
		await this.usersService.setPassword(id, hashed);
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
