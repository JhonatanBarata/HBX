import structuralDefaults from './structural-defaults.json';

type RolePermissionMap = Record<string, Record<string, boolean>>;

const COMPANY_ROLE_PERMISSIONS = structuralDefaults.companyRolePermissions as RolePermissionMap;

export function buildImportacaoPermissaoRows(companyId: number) {
  const rows: Array<{
    empresaId: number;
    role: string;
    acao: string;
    allowed: boolean;
  }> = [];

  for (const [role, actions] of Object.entries(COMPANY_ROLE_PERMISSIONS)) {
    for (const [acao, allowed] of Object.entries(actions)) {
      rows.push({
        empresaId: companyId,
        role,
        acao,
        allowed: Boolean(allowed),
      });
    }
  }

  return rows;
}