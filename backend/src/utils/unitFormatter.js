const unitForms = {
  unidade: ['unidade', 'unidades'],
  unidades: ['unidade', 'unidades'],
  un: ['un', 'un'],
  und: ['und', 'und'],
  garrafa: ['garrafa', 'garrafas'],
  garrafas: ['garrafa', 'garrafas'],
  caixa: ['caixa', 'caixas'],
  caixas: ['caixa', 'caixas'],
  pacote: ['pacote', 'pacotes'],
  pacotes: ['pacote', 'pacotes'],
  lata: ['lata', 'latas'],
  latas: ['lata', 'latas'],
  copo: ['copo', 'copos'],
  copos: ['copo', 'copos'],
  litro: ['litro', 'litros'],
  litros: ['litro', 'litros'],
  l: ['l', 'l'],
  ml: ['ml', 'ml'],
  kg: ['kg', 'kg'],
  g: ['g', 'g'],
  grama: ['grama', 'gramas'],
  gramas: ['grama', 'gramas'],
  quilo: ['quilo', 'quilos'],
  quilos: ['quilo', 'quilos'],
  porcao: ['porcao', 'porcoes'],
  porcoes: ['porcao', 'porcoes'],
  porção: ['porção', 'porções'],
  porções: ['porção', 'porções'],
  fatia: ['fatia', 'fatias'],
  fatias: ['fatia', 'fatias'],
  bandeja: ['bandeja', 'bandejas'],
  bandejas: ['bandeja', 'bandejas'],
  saco: ['saco', 'sacos'],
  sacos: ['saco', 'sacos']
};

const decimal = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 2
});

function genericPlural(unit) {
  if (!unit) return '';
  if (/^[a-z]{1,3}$/i.test(unit)) return unit;
  if (unit.endsWith('ão')) return `${unit.slice(0, -2)}ões`;
  if (unit.endsWith('m')) return `${unit.slice(0, -1)}ns`;
  if (/[rz]$/i.test(unit)) return `${unit}es`;
  if (/[aeiouáéíóúâêôãõ]$/i.test(unit)) return `${unit}s`;
  return unit.endsWith('s') ? unit : `${unit}s`;
}

function genericSingular(unit) {
  if (!unit) return '';
  if (/^[a-z]{1,3}$/i.test(unit)) return unit;
  if (unit.endsWith('ões')) return `${unit.slice(0, -3)}ão`;
  if (unit.endsWith('ns')) return `${unit.slice(0, -2)}m`;
  if (unit.endsWith('es') && /[rz]es$/i.test(unit)) return unit.slice(0, -2);
  if (unit.endsWith('s')) return unit.slice(0, -1);
  return unit;
}

function pluralizeUnit(unit, quantity) {
  const normalized = String(unit || '').trim().toLowerCase();
  if (!normalized) return '';

  const forms = unitForms[normalized];
  const isSingular = Math.abs(Number(quantity)) === 1;

  if (forms) return isSingular ? forms[0] : forms[1];
  return isSingular ? genericSingular(normalized) : genericPlural(normalized);
}

function formatQuantityWithUnit(quantity, unit) {
  const label = pluralizeUnit(unit, quantity);
  return [decimal.format(Number(quantity || 0)), label].filter(Boolean).join(' ');
}

module.exports = {
  pluralizeUnit,
  formatQuantityWithUnit
};
