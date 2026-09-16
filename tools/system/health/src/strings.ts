export interface HealthStrings {
  readonly checkedAt: string;
  readonly empty: string;
  readonly error: string;
  readonly healthy: string;
  readonly loading: string;
  readonly title: string;
}

export const healthStrings: Readonly<Record<'en' | 'fr', HealthStrings>> = {
  en: {
    checkedAt: 'Checked at',
    empty: 'No capability status is available.',
    error: 'Service status is temporarily unavailable.',
    healthy: 'Available',
    loading: 'Checking service status',
    title: 'KEYFORTA service status',
  },
  fr: {
    checkedAt: 'Verifie a',
    empty: 'Aucun etat de capacite disponible.',
    error: "L'etat du service est temporairement indisponible.",
    healthy: 'Disponible',
    loading: "Verification de l'etat du service",
    title: 'Etat du service KEYFORTA',
  },
};