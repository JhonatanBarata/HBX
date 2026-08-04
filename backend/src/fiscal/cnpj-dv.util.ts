// B0 BALCÃO — EXIGIR E CONFERIR CNPJ (decisão 12): antes do rito, o perfil só
// checava TAMANHO (14 dígitos). Aqui é a matemática oficial dos 2 dígitos
// verificadores — barra CNPJ digitado errado antes de qualquer consulta.

/** true se os 14 dígitos fecham com os 2 dígitos verificadores oficiais. */
export function cnpjDvValido(cnpjRaw: string): boolean {
  const d = String(cnpjRaw || '').replace(/\D/g, '');
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false; // 00000000000000 etc. passam no DV mas não existem
  const dv = (len: number): number => {
    let peso = len - 7; // 5 para o 1º dígito, 6 para o 2º
    let soma = 0;
    for (let i = 0; i < len; i++) {
      soma += Number(d[i]) * peso;
      peso -= 1;
      if (peso < 2) peso = 9;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}
