import { IsInt, Min } from 'class-validator';

// MASTER "entrar como": o único dado é o id do usuário-alvo. A autorização (só
// master) fica no MasterGuard do controller; aqui só validamos o formato.
export class ImpersonateUserDto {
  @IsInt()
  @Min(1)
  userId!: number;
}
