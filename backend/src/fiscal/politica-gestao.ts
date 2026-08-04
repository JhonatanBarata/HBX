// B0 BALCÃO (decisão 12) — POLÍTICA do modo HBX Gestão Fiscal.
// Ordem do dono: "sem enfeitar, resumir e me proteger pela lei". Texto curto,
// honesto, versionado — o aceite grava usuário/data/versão no perfil. Mudou o
// texto → sobe a versão → aceite antigo não vale pro rito novo.

export const TIPOS_EMPRESA = ['agua', 'gas', 'bebidas', 'deposito', 'outro'] as const;

export const TIPOS_EMPRESA_ROTULO: Record<string, string> = {
  agua: 'Distribuidora de água',
  gas: 'Distribuidora de gás',
  bebidas: 'Distribuidora de bebidas',
  deposito: 'Depósito / atacarejo',
  outro: 'Outro ramo',
};

export const POLITICA_GESTAO = {
  versao: '1.0',
  titulo: 'Política do modo HBX Gestão Fiscal',
  secoes: [
    {
      titulo: 'O que este modo faz',
      texto:
        'Liga o controle de Produtos e estoque com trilha de movimentos, a entrada de notas de compra por XML e a emissão de documentos fiscais conforme a configuração da empresa. Documentos e movimentos ficam guardados como registro permanente da empresa, com exportação para o contador (malote).',
    },
    {
      titulo: 'O que este modo NÃO é',
      texto:
        'O HBX não é escritório de contabilidade, não calcula nem recolhe tributos e não substitui o contador. Enquadramento tributário, alíquotas e obrigações continuam sendo responsabilidade da empresa e do contador dela.',
    },
    {
      titulo: 'Conferência do CNPJ',
      texto:
        'Para ativar, o CNPJ é obrigatório e conferido nos dados públicos da Receita Federal (situação cadastral, razão social, regime). O resultado da conferência fica gravado no perfil, com a data.',
    },
    {
      titulo: 'Responsabilidade pelos lançamentos',
      texto:
        'As informações lançadas (notas, quantidades, valores) são declaradas pela empresa. O HBX registra cada lançamento com data e autor, e não altera nem apaga lançamentos — correção é feita por movimento novo, com rastro.',
    },
    {
      titulo: 'Ativação irreversível após o primeiro lançamento',
      texto:
        'Depois da primeira nota de entrada ou do primeiro movimento de estoque, o modo não pode mais ser desligado: o histórico passa a fazer parte da escrituração da empresa e permanece disponível para consulta e exportação.',
    },
    {
      titulo: 'Registro do aceite',
      texto: 'O aceite desta política é gravado com usuário, data e versão.',
    },
  ],
};
