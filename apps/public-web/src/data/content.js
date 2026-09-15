export const properties = [
  {
    id: 'ngaliema-river',
    title: 'Riverside apartment',
    area: 'Ngaliema',
    price: 400,
    beds: 2,
    baths: 1,
    available: 'Available now',
    verified: 'Property details reviewed',
    description:
      'A bright two-bedroom apartment with a practical layout, secure access, and convenient connections to central Kinshasa.',
    amenities: ['Secure compound', 'Water reserve', 'Parking', 'Backup power ready'],
    depositMonths: 4,
  },
  {
    id: 'limete-courtyard',
    title: 'Courtyard residence',
    area: 'Limete',
    price: 350,
    beds: 2,
    baths: 1,
    available: 'Available October 1',
    verified: 'Owner information submitted',
    description:
      'A well-kept two-bedroom home arranged around a quiet shared courtyard, suited to a small family or professional household.',
    amenities: ['Gated access', 'Shared courtyard', 'On-site caretaker', 'Public transport nearby'],
    depositMonths: 4,
  },
  {
    id: 'kintambo-studio',
    title: 'Compact city apartment',
    area: 'Kintambo',
    price: 250,
    beds: 1,
    baths: 1,
    available: 'Available now',
    verified: 'Property details reviewed',
    description:
      'A compact one-bedroom apartment that keeps living, cooking, and private space clearly separated.',
    amenities: ['Private entrance', 'Water storage', 'Local shops nearby', 'Simple monthly terms'],
    depositMonths: 4,
  },
  {
    id: 'gombe-view',
    title: 'Urban view residence',
    area: 'Gombe',
    price: 850,
    beds: 3,
    baths: 2,
    available: 'Available November 1',
    verified: 'Property details reviewed',
    description: 'A spacious urban residence with generous living areas and convenient access to offices and services.',
    amenities: ['24/7 security', 'Elevator', 'Generator', 'Reserved parking'],
    depositMonths: 4,
  },
  {
    id: 'lingwala-family',
    title: 'Family courtyard home',
    area: 'Lingwala',
    price: 500,
    beds: 3,
    baths: 2,
    available: 'Available now',
    verified: 'Owner information submitted',
    description: 'A practical family home with a protected courtyard and room for long-term living.',
    amenities: ['Private courtyard', 'Secure gate', 'Water reserve', 'Pet friendly'],
    depositMonths: 4,
  },
  {
    id: 'kinshasa-center',
    title: 'Central one-bedroom',
    area: 'Kinshasa',
    price: 300,
    beds: 1,
    baths: 1,
    available: 'Available October 15',
    verified: 'Property details reviewed',
    description: 'An accessible one-bedroom home close to everyday services and public transportation.',
    amenities: ['Private meter', 'Secure entrance', 'Market nearby', 'Flexible viewing'],
    depositMonths: 4,
  },
];

const frPropertyCopy = {
  'ngaliema-river': {
    title: 'Appartement Riverside',
    available: 'Disponible maintenant',
    verified: 'Details du bien examines',
    description:
      'Un appartement lumineux de deux chambres, avec une disposition pratique, un acces securise et des liaisons faciles vers le centre de Kinshasa.',
    amenities: ['Residence securisee', 'Reserve d eau', 'Parking', 'Alimentation de secours prete'],
  },
  'limete-courtyard': {
    title: 'Residence avec cour',
    available: 'Disponible le 1er octobre',
    verified: 'Informations du proprietaire soumises',
    description:
      'Un logement soigne de deux chambres organise autour d une cour commune calme, adapte a une petite famille ou a un menage professionnel.',
    amenities: ['Acces cloture', 'Cour commune', 'Gardien sur place', 'Transports en commun a proximite'],
  },
  'kintambo-studio': {
    title: 'Appartement citadin compact',
    available: 'Disponible maintenant',
    verified: 'Details du bien examines',
    description:
      'Un appartement compact d une chambre qui separe clairement l espace de vie, la cuisine et l espace prive.',
    amenities: ['Entree privee', 'Stockage d eau', 'Commerces de proximite', 'Conditions mensuelles simples'],
  },
  'gombe-view': {
    title: 'Residence avec vue urbaine',
    available: 'Disponible le 1er novembre',
    verified: 'Details du bien examines',
    description:
      'Une residence urbaine spacieuse avec de beaux espaces de vie et un acces pratique aux bureaux et aux services.',
    amenities: ['Securite 24 h/24', 'Ascenseur', 'Generateur', 'Parking reserve'],
  },
  'lingwala-family': {
    title: 'Maison familiale avec cour',
    available: 'Disponible maintenant',
    verified: 'Informations du proprietaire soumises',
    description:
      'Une maison familiale pratique avec une cour protegee et l espace necessaire pour y vivre durablement.',
    amenities: ['Cour privee', 'Portail securise', 'Reserve d eau', 'Animaux acceptes'],
  },
  'kinshasa-center': {
    title: 'Appartement central d une chambre',
    available: 'Disponible le 15 octobre',
    verified: 'Details du bien examines',
    description: 'Un logement d une chambre proche des services quotidiens et des transports publics.',
    amenities: ['Compteur prive', 'Entree securisee', 'Marche a proximite', 'Visite flexible'],
  },
};

export const navRoutes = [
  ['properties', 'nav_properties'],
  ['how', 'nav_how'],
  ['landlords', 'nav_landlords_short'],
  ['trust', 'nav_trust'],
  ['voice', 'nav_voice'],
  ['faq', 'faq_short'],
  ['contact', 'contact'],
  ['signin', 'sign_in_short'],
];

export function localizeProperty(item, lang) {
  if (lang !== 'fr') return item;
  return { ...item, ...(frPropertyCopy[item.id] || {}) };
}

export function money(value, lang) {
  return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export const workspaceMenu = {
  tenant: ['dashboard', 'rental', 'maintenance', 'messages'],
  landlord: ['dashboard', 'properties', 'applications', 'maintenance'],
  manager: ['dashboard', 'applications', 'properties', 'maintenance'],
  operator: ['dashboard', 'assigned-jobs', 'quotes-reports', 'services'],
};