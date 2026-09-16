export const healthStrings = Object.freeze({
  en: Object.freeze({
    description: 'Displays the synthetic KEYFORTA MCP capability status.',
    empty: 'No capability details are available.',
    error: 'Health status is temporarily unavailable.',
    loading: 'Checking synthetic capability status…',
    title: 'KEYFORTA capability status',
    healthy: 'Available',
  }),
  fr: Object.freeze({
    description: 'Affiche l’état de la capacité MCP synthétique de KEYFORTA.',
    empty: 'Aucun détail de capacité n’est disponible.',
    error: 'L’état de santé est temporairement indisponible.',
    loading: 'Vérification de la capacité synthétique…',
    title: 'État de la capacité KEYFORTA',
    healthy: 'Disponible',
  }),
});

export function stringsFor(locale = 'en') {
  return healthStrings[locale.split('-')[0]] ?? healthStrings.en;
}
