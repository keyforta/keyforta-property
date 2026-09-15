const properties = [
  { id: 'ngaliema-river', title: 'Riverside apartment', area: 'Ngaliema', price: 400, beds: 2, baths: 1, available: 'Available now', verified: 'Property details reviewed', description: 'A bright two-bedroom apartment with a practical layout, secure access, and convenient connections to central Kinshasa.', amenities: ['Secure compound', 'Water reserve', 'Parking', 'Backup power ready'], depositMonths: 4 },
  { id: 'limete-courtyard', title: 'Courtyard residence', area: 'Limete', price: 350, beds: 2, baths: 1, available: 'Available October 1', verified: 'Owner information submitted', description: 'A well-kept two-bedroom home arranged around a quiet shared courtyard, suited to a small family or professional household.', amenities: ['Gated access', 'Shared courtyard', 'On-site caretaker', 'Public transport nearby'], depositMonths: 4 },
  { id: 'kintambo-studio', title: 'Compact city apartment', area: 'Kintambo', price: 250, beds: 1, baths: 1, available: 'Available now', verified: 'Property details reviewed', description: 'A compact one-bedroom apartment that keeps living, cooking, and private space clearly separated.', amenities: ['Private entrance', 'Water storage', 'Local shops nearby', 'Simple monthly terms'], depositMonths: 4 },
  { id: 'gombe-view', title: 'Urban view residence', area: 'Gombe', price: 850, beds: 3, baths: 2, available: 'Available November 1', verified: 'Property details reviewed', description: 'A spacious urban residence with generous living areas and convenient access to offices and services.', amenities: ['24/7 security', 'Elevator', 'Generator', 'Reserved parking'], depositMonths: 4 },
  { id: 'lingwala-family', title: 'Family courtyard home', area: 'Lingwala', price: 500, beds: 3, baths: 2, available: 'Available now', verified: 'Owner information submitted', description: 'A practical family home with a protected courtyard and room for long-term living.', amenities: ['Private courtyard', 'Secure gate', 'Water reserve', 'Pet friendly'], depositMonths: 4 },
  { id: 'kinshasa-center', title: 'Central one-bedroom', area: 'Kinshasa', price: 300, beds: 1, baths: 1, available: 'Available October 15', verified: 'Property details reviewed', description: 'An accessible one-bedroom home close to everyday services and public transportation.', amenities: ['Private meter', 'Secure entrance', 'Market nearby', 'Flexible viewing'], depositMonths: 4 }
];

const translations = {
  en: { nav_properties: 'Properties', nav_how: 'How it works', nav_landlords: 'For landlords', nav_landlords_short: 'Landlords', nav_trust: 'Trust & safety', request_access: 'Request access', sign_in: 'Demo sign in', sign_in_short: 'Sign in', footer_summary: 'Clear property information. Reliable rental records. Better relationships.', explore: 'Explore', company: 'Company', contact: 'Contact', legal: 'Legal', privacy: 'Privacy', terms: 'Terms', early_access: 'Early access', join_launch: 'Join the KEYFORTA launch', access_intro: 'Choose how you plan to use the platform. This demo saves your request only in this browser until the backend is connected.', full_name: 'Full name', email: 'Email address', i_am: 'I am a', select_one: 'Select one', location: 'City or country', submit_request: 'Submit request', voice_eyebrow: 'AI voice generator', voice_title: 'Give property information a voice.', voice_intro: 'Create a spoken preview from a property description, service update, or message. This public preview uses your browser and does not send text to a server.', voice_label: 'Text to speak', voice_voice: 'Voice', voice_default: 'Browser default', voice_play: 'Generate voice preview', voice_stop: 'Stop preview', voice_status_ready: 'Ready for a voice preview.', voice_status_playing: 'Playing your voice preview in this browser.', voice_status_stopped: 'Voice preview stopped.', voice_status_unavailable: 'Voice playback is not available in this browser.' },
  fr: { nav_properties: 'Biens', nav_how: 'Fonctionnement', nav_landlords: 'Pour propriétaires', nav_landlords_short: 'Propriétaires', nav_trust: 'Confiance et sécurité', request_access: 'Demander accès', sign_in: 'Connexion démo', sign_in_short: 'Connexion', footer_summary: 'Informations claires. Dossiers fiables. Meilleures relations locatives.', explore: 'Explorer', company: 'Entreprise', contact: 'Contact', legal: 'Juridique', privacy: 'Confidentialité', terms: 'Conditions', early_access: 'Accès anticipé', join_launch: 'Rejoignez le lancement de KEYFORTA', access_intro: 'Indiquez comment vous souhaitez utiliser la plateforme. Cette démo enregistre la demande uniquement dans ce navigateur jusqu’à la connexion du backend.', full_name: 'Nom complet', email: 'Adresse e-mail', i_am: 'Je suis', select_one: 'Sélectionnez', location: 'Ville ou pays', submit_request: 'Envoyer la demande', voice_eyebrow: 'Générateur de voix IA', voice_title: 'Donnez une voix aux informations immobilières.', voice_intro: 'Créez un aperçu vocal à partir d’une description, d’une mise à jour de service ou d’un message. Cette démo utilise votre navigateur et n’envoie pas le texte à un serveur.', voice_label: 'Texte à lire', voice_voice: 'Voix', voice_default: 'Voix par défaut du navigateur', voice_play: 'Générer un aperçu vocal', voice_stop: 'Arrêter l’aperçu', voice_status_ready: 'Prêt pour un aperçu vocal.', voice_status_playing: 'Votre aperçu vocal est lu dans ce navigateur.', voice_status_stopped: 'Aperçu vocal arrêté.', voice_status_unavailable: 'La lecture vocale n’est pas disponible dans ce navigateur.' }
};

let lang = localStorage.getItem('kf-language') || 'en';
let hasRendered = false;
const app = document.querySelector('#app');
const dialog = document.querySelector('#access-dialog');
const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const save = (key, value) => { const rows = JSON.parse(localStorage.getItem(key) || '[]'); rows.push({ ...value, createdAt: new Date().toISOString() }); localStorage.setItem(key, JSON.stringify(rows)); };
const pageTitles = { home: 'KEYFORTA — Find and manage property with confidence', properties: 'Properties — KEYFORTA', how: 'How it works — KEYFORTA', landlords: 'For landlords and managers — KEYFORTA', trust: 'Trust and safety — KEYFORTA', faq: 'Frequently asked questions — KEYFORTA', contact: 'Contact — KEYFORTA', privacy: 'Privacy notice — KEYFORTA', terms: 'Terms of use — KEYFORTA', signin: 'Demo access — KEYFORTA', demo: 'Workspace demo — KEYFORTA', voice: 'AI Voice Generator — KEYFORTA' };

function propertyCard(p) {
  return `<a class="property-card" href="#property/${p.id}"><div class="property-image"><span class="badge">${p.available}</span></div><div class="card-body"><span class="price">${money(p.price)} <small>/ month</small></span><h3>${p.title}</h3><p class="meta">${p.area}, Kinshasa · ${p.beds} bedroom${p.beds > 1 ? 's' : ''} · ${p.baths} bathroom${p.baths > 1 ? 's' : ''}</p><p class="verification-line"><span class="check-mark">✓</span>${p.verified}</p></div></a>`;
}

function home() {
  return `<div class="page"><section class="shell hero"><div class="hero-copy"><p class="eyebrow">A better way home</p><h1>Rent with clarity.<br>Manage with confidence.</h1><p>Discover dependable rentals and keep the important parts of a rental relationship clear—from viewing through monthly payments.</p><div class="hero-actions"><a class="button copper" href="#properties">Browse properties</a><button class="button secondary" data-open-access type="button">Request access</button></div></div><div class="hero-media" role="img" aria-label="Apartment buildings in Kinshasa at golden hour"></div></section><section class="shell demo-banner"><span class="status-dot"></span><strong>Public preview</strong><span>All listings, accounts, payments, and messages are simulated with mock data.</span><a href="#status">See what is included</a></section><section class="shell stats"><div class="stat"><strong>Mock listings</strong><span>Explore the future experience</span></div><div class="stat"><strong>Clear costs</strong><span>Rent and terms up front</span></div><div class="stat"><strong>For everyone</strong><span>Tenants, owners, managers and operators</span></div><div class="stat"><strong>Kinshasa first</strong><span>Built for local realities</span></div></section><section class="section white"><div class="shell"><div class="section-head"><div><p class="eyebrow">Featured homes</p><h2>Start with what matters.</h2></div><p>Explore demonstration listings with example availability, verification signals, rental terms, and viewing requests.</p></div><div class="cards">${properties.slice(0, 3).map(propertyCard).join('')}</div><div class="card-actions"><a class="button secondary" href="#properties">View all properties</a></div></div></section><section class="section audience-section"><div class="shell"><div class="section-head"><div><p class="eyebrow">Choose your path</p><h2>One platform, four starting points.</h2></div><p>Start with the part of the rental journey that matters most to you.</p></div><div class="audience-grid"><article class="audience-card"><span class="audience-icon">01</span><h3>Find a home</h3><p>Compare homes, understand the full cost, and request a viewing.</p><a href="#properties">Browse properties →</a></article><article class="audience-card"><span class="audience-icon">02</span><h3>List a property</h3><p>Present your homes clearly and prepare for better tenant conversations.</p><a href="#landlords">For landlords →</a></article><article class="audience-card"><span class="audience-icon">03</span><h3>Manage rentals</h3><p>Review a mock workspace for units, agreements, payments, and maintenance.</p><a href="#demo/manager">Open manager demo →</a></article><article class="audience-card"><span class="audience-icon">04</span><h3>Maintain properties</h3><p>Review assigned jobs, coordinate visits, and record service evidence.</p><a href="#demo/operator">Open operator demo →</a></article></div></div></section><section class="section"><div class="shell"><div class="section-head"><div><p class="eyebrow">One shared standard</p><h2>A clearer rental journey.</h2></div></div><div class="feature-grid">${[['01', 'Discover', 'Compare homes with practical details, full monthly costs, and availability.'], ['02', 'Verify', 'See what has been submitted, reviewed, and still requires confirmation.'], ['03', 'Manage', 'Keep payments, receipts, maintenance, and communication in one trusted record.']].map((x) => `<article class="feature"><span class="number">${x[0]}</span><h3>${x[1]}</h3><p>${x[2]}</p></article>`).join('')}</div></div></section><section class="section white" id="status"><div class="shell"><div class="section-head"><div><p class="eyebrow">Complete public preview</p><h2>See the product before the connection.</h2></div><p>The public layer is ready to demonstrate the core journey while your production services are connected.</p></div><div class="status-grid"><div class="status-panel"><h3>Visitors can explore</h3><ul><li>Mock listings, filters, sorting, and detail pages</li><li>Availability, costs, terms, and verification signals</li><li>Viewing, property-interest, and contact requests</li><li>Tenant, landlord, manager, and operator demo workspaces</li><li>AI voice previews for property and service messages</li></ul></div><div class="status-panel next"><h3>Production services to connect</h3><ul><li>Backend, database, and live inventory</li><li>Authentication, roles, and verification evidence</li><li>Payments, receipts, notifications, and email</li><li>Maintenance messaging and final legal documents</li><li>API contracts for every mock read and write action</li></ul></div></div><div class="launch-cta"><div><p class="eyebrow">Stay close to the launch</p><h3>Help shape the first connected version.</h3></div><button class="button copper" data-open-access type="button">Request early access</button></div></div></section></div>`;
}

function listings() {
  return `<section class="page content-page shell"><div class="section-head"><div><p class="eyebrow">Property discovery <span class="demo-label">Mock data</span></p><h1>Find a home that fits.</h1></div><p>Compare demonstration listings. No property shown here is currently being offered for rent.</p></div><form class="filters" id="filters"><label>Neighborhood<input name="area" placeholder="e.g. Ngaliema"></label><label>Bedrooms<select name="beds"><option value="">Any</option><option value="1">1+</option><option value="2">2+</option><option value="3">3+</option></select></label><label>Maximum rent<select name="max"><option value="">Any</option><option value="300">$300</option><option value="500">$500</option><option value="900">$900</option></select></label><label>Sort by<select name="sort"><option value="recommended">Recommended</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="beds">Bedrooms</option></select></label><button class="button" type="submit">Apply filters</button><button class="button secondary reset-filters" id="reset-filters" type="button">Reset</button></form><p class="results-count" id="results-count" role="status" aria-live="polite" aria-atomic="true"></p><div class="cards" id="property-results"></div></section>`;
}

function detail(id) {
  const p = properties.find((x) => x.id === id) || properties[0];
  const deposit = p.price * p.depositMonths;
  return `<section class="page shell detail"><div><a href="#properties">← Back to properties</a><div class="detail-photo" role="img" aria-label="${p.title}"></div><div class="content-narrow"><p class="notice"><strong>Demonstration listing:</strong> This property is mock data. It cannot be reserved, rented, or paid for through KEYFORTA yet.</p><div class="detail-facts"><span><strong>${p.beds}</strong> bedrooms</span><span><strong>${p.baths}</strong> bathroom${p.baths > 1 ? 's' : ''}</span><span><strong>${p.area}</strong> neighborhood</span><span><strong>Mock</strong> verification</span></div><h2>About this home</h2><p>${p.description}</p><h2>What is included</h2><div class="amenities">${p.amenities.map((a) => `<span>${a}</span>`).join('')}</div><div class="detail-sections"><div class="trust-card"><h3>Verification preview</h3><p><span class="check-mark">✓</span>${p.verified}</p><p><span class="pending-mark">○</span>Ownership authority: pending production evidence</p><p><span class="pending-mark">○</span>Participant identity: checked during onboarding</p></div><div class="cost-card"><h3>Illustrative move-in costs</h3><div><span>Monthly rent</span><strong>${money(p.price)}</strong></div><div><span>Example deposit (${p.depositMonths} months)</span><strong>${money(deposit)}</strong></div><div class="total"><span>Shown before commitment</span><strong>${money(p.price + deposit)}</strong></div><small>Mock figures only. Final terms will come from the connected agreement.</small></div></div></div></div><aside class="detail-panel"><p class="eyebrow">${p.available}</p><h1>${p.title}</h1><p class="meta">${p.area}, Kinshasa</p><p class="price">${money(p.price)} <small>/ month</small></p><p>${p.beds} bedroom${p.beds > 1 ? 's' : ''} · ${p.baths} bathroom${p.baths > 1 ? 's' : ''} · 1 living room · 1 kitchen</p><button class="button" data-open-access data-property-interest="${p.title}" type="button">Request a viewing</button><a class="text-link" href="#trust">How verification works →</a></aside></section>`;
}

function how() {
  const steps = [['01', 'Search', 'Browse clear listings and compare location, price, layout, amenities, and availability.'], ['02', 'Verify', 'Review property, authority, and participant verification signals before arranging a viewing.'], ['03', 'Visit', 'Request a viewing and keep appointment details in one place.'], ['04', 'Agree', 'Review rent, deposit, responsibilities, and documents before signing.'], ['05', 'Pay', 'Record payments and receipts so both sides share the same history.'], ['06', 'Maintain', 'Submit requests, track progress, and preserve communication through move-out.']];
  return `<section class="page content-page"><div class="shell route-shell"><p class="eyebrow">How it works</p><h1>A rental process everyone can understand.</h1><p class="intro-copy">KEYFORTA is designed around a shared record: the same property, terms, payments, and requests can be understood by the people who are allowed to see them.</p><div class="feature-grid">${steps.map((x) => `<article class="feature"><span class="number">${x[0]}</span><h3>${x[1]}</h3><p>${x[2]}</p></article>`).join('')}</div></div></section>`;
}

function landlords() {
  return `<section class="page content-page shell"><div class="landlord-grid"><div><p class="eyebrow">For landlords and managers</p><h1>Put every property relationship in view.</h1><p class="muted">Prepare listings, organize tenant information, and establish a reliable operational record.</p><ul><li>Consistent property and unit records</li><li>Clear rent, deposit, and availability details</li><li>Viewing and application workflows</li><li>Future payment and maintenance tracking</li></ul><div class="mini-capability-list"><span>Listings</span><span>Verification</span><span>Payments</span><span>Maintenance</span></div></div><div class="form-card"><h2>List a property <span class="demo-label">Demo</span></h2><p class="muted">This sends a local mock request only. It does not publish a property.</p><form class="form-grid demo-form"><label>Owner or company name<input name="name" required></label><label>Email address<input name="email" type="email" required></label><label>Property location<input name="location" required></label><label>Number of units<input name="units" type="number" min="1" required></label><label>Tell us about the property<textarea name="message"></textarea></label><button class="button" type="submit">Submit property interest</button><p class="form-status" role="status"></p></form></div></div></section>`;
}

function trust() {
  return `<section class="page content-page"><div class="shell route-shell"><p class="eyebrow">Trust & safety</p><h1>Clarity before commitment.</h1><p>KEYFORTA is being designed to reduce ambiguity across listings, people, agreements, payments, and maintenance. The signals below are examples of how a connected workflow can communicate what is known and what still needs evidence.</p><div class="trust-steps"><article><span class="number">01</span><h3>Collect</h3><p>Gather property details, ownership or management authority, identity information, and supporting evidence.</p></article><article><span class="number">02</span><h3>Review</h3><p>Record who reviewed each item, when it was reviewed, and whether more information is required.</p></article><article><span class="number">03</span><h3>Communicate</h3><p>Show participants clear status labels and a safe path to report a concern before money changes hands.</p></article></div><h2>Safety principles</h2><div class="principle-list"><p><strong>Transparent terms.</strong> Rent, deposits, responsibilities, fees, and important dates should be visible before a tenant commits.</p><p><strong>Shared records.</strong> Agreements, receipts, requests, and important communication should be preserved for the appropriate participants.</p><p><strong>No false certainty.</strong> A submitted document is not the same as a verified claim. Mock data is never a rental offer.</p></div><p class="notice"><strong>Stay safe:</strong> Never send money based solely on a public listing. Confirm the property, recipient, and written terms through a trusted channel.</p></div></section>`;
}

function faq() {
  const questions = [['Are these properties available?', 'No. Every current listing is mock data created to demonstrate the future public experience.'], ['Can I pay rent through this website?', 'Not yet. The preview shows where payments and receipts will appear, but no money is collected.'], ['How will properties be verified?', 'The future workflow will collect property details, ownership or management authority, and evidence before displaying a verification status.'], ['Can a landlord list multiple units?', 'Yes. The planned platform supports properties with one or many units and a dedicated management workspace.'], ['Will KEYFORTA support French?', 'Yes. The public experience includes an initial French-language mode, with broader translation coverage planned for the connected product.'], ['How are deposits handled?', 'Deposit rules will be stated clearly in each agreement, including amount, payment, permitted deductions, and final disposition.'], ['Will tenants receive notifications?', 'The connected product is planned to support viewing updates, payment reminders, maintenance updates, and important account notifications.'], ['Can I report a concern?', 'Yes. Use the contact page for a safety concern in this preview. A connected product will add participant-specific reporting and case tracking.']];
  return `<section class="page content-page shell route-shell"><p class="eyebrow">Frequently asked questions</p><h1>Answers before you begin.</h1><div class="faq-list">${questions.map((x) => `<details><summary>${x[0]}</summary><p>${x[1]}</p></details>`).join('')}</div></section>`;
}

function contact() {
  return `<section class="page content-page shell"><div class="contact-grid"><div class="contact-card"><p class="eyebrow">Contact</p><h1>How can we help?</h1><p class="muted">Use this demonstration form for general questions, launch interest, or safety concerns.</p><p><strong>Email</strong><br><a href="mailto:hello@keyforta.com">hello@keyforta.com</a></p><p><strong>Initial market</strong><br>Kinshasa, Democratic Republic of the Congo</p><div class="support-note"><strong>Mock-data notice</strong><span>Messages are saved only in this browser until email delivery is connected.</span></div></div><div class="form-card"><form class="form-grid demo-form"><label>Full name<input name="name" required></label><label>Email address<input name="email" type="email" required></label><label>Topic<select name="topic"><option>General question</option><option>Tenant support</option><option>Landlord inquiry</option><option>Report a concern</option></select></label><label>Message<textarea name="message" required></textarea></label><button class="button" type="submit">Send message</button><p class="form-status" role="status"></p></form></div></div></section>`;
}

function legal(type) {
  const privacy = type === 'privacy';
  return `<section class="page content-page shell content-narrow"><p class="eyebrow">Legal</p><h1>${privacy ? 'Privacy notice' : 'Terms of use'}</h1><p class="notice"><strong>Draft for review:</strong> This text is a public-preview placeholder and must be replaced with the finalized company, backend, data flows, retention rules, and applicable-law language before commercial launch.</p>${privacy ? '<h2>Information collected</h2><p>This demonstration may store form entries, mock requests, and language preference in your browser. It does not transmit them to a KEYFORTA server.</p><h2>Cookies and local storage</h2><p>The demonstration uses local storage for language preference and locally submitted mock forms. A connected product will publish its final cookie, analytics, and retention disclosures.</p><h2>Your choices</h2><p>You can clear locally stored information through your browser settings. Contact and account rights will be described in the finalized privacy notice.</p>' : '<h2>Demonstration only</h2><p>The current website presents mock listings and front-end demonstrations. It does not create a tenancy, reserve a property, verify a person or property, or process a payment.</p><h2>Acceptable use</h2><p>Do not misuse the site, impersonate another person, submit unlawful material, or interfere with the service.</p><h2>No reliance on mock listings</h2><p>Property information is fictional and must not be used for a rental or financial decision.</p>'}</section>`;
}

function signIn() {
  const french = lang === 'fr';
  const copy = french ? {
    eyebrow: 'Accès démo',
    title: 'Choisissez votre espace KEYFORTA.',
    intro: 'Explorez une expérience par rôle. Cette démo n’ouvre pas de compte et ne vérifie aucun identifiant.',
    demoEyebrow: 'Explorer la démo',
    demoTitle: 'Aperçu des espaces de travail',
    demoIntro: 'Consultez les principaux parcours avant de créer ou de connecter votre compte.',
    tenant: 'Espace locataire',
    tenantDesc: 'Consultez une demande de visite, un rappel de loyer, vos reçus et une mise à jour de maintenance.',
    tenantCta: 'Ouvrir la démo locataire →',
    landlord: 'Espace propriétaire',
    landlordDesc: 'Examinez l’occupation, les loyers, les biens et les interventions de maintenance.',
    landlordCta: 'Ouvrir la démo propriétaire →',
    manager: 'Espace gestionnaire',
    managerDesc: 'Suivez les unités, les tâches, les vérifications et l’activité des participants.',
    managerCta: 'Ouvrir la démo gestionnaire →',
    operator: 'Espace opérateur de maintenance',
    operatorDesc: 'Gérez les ordres de travail, devis, visites, rapports terrain et revenus fictifs.',
    operatorCta: 'Ouvrir la démo opérateur →',
    accountEyebrow: 'Créer un compte',
    accountTitle: 'Commencez selon votre rôle.',
    accountIntro: 'Choisissez le parcours qui correspond à votre activité. Les gestionnaires rejoignent une organisation sur invitation d’un propriétaire.',
    landlordEntry: 'Je possède ou représente des biens',
    landlordEntryDesc: 'Créez votre compte propriétaire pour ajouter vos biens, suivre les locations et inviter un gestionnaire.',
    landlordMeta: 'Propriétaires · sociétés immobilières',
    landlordAction: 'Créer un compte propriétaire',
    operatorEntry: 'Je propose des services de maintenance',
    operatorEntryDesc: 'Créez votre profil opérateur pour proposer vos services et recevoir des tâches sur les biens concernés.',
    operatorMeta: 'Plombiers · électriciens · techniciens',
    operatorAction: 'Rejoindre comme opérateur',
    production: 'Point de connexion production :',
    productionDesc: 'Les portails de production et l’administration sont des applications séparées et commencent toujours par une connexion.',
    api: 'Ouvrir le workbench de préparation API →'
  } : {
    eyebrow: 'Demo access',
    title: 'Choose your KEYFORTA workspace.',
    intro: 'Explore a role-based experience. This preview does not create an account or check credentials.',
    demoEyebrow: 'Explore the demo',
    demoTitle: 'Preview the workspaces',
    demoIntro: 'See the main journeys before creating or connecting your account.',
    tenant: 'Tenant workspace',
    tenantDesc: 'View a mock viewing request, rent reminder, receipt history, and maintenance update.',
    tenantCta: 'Enter tenant demo →',
    landlord: 'Landlord workspace',
    landlordDesc: 'Review mock occupancy, rent collection, listings, and open maintenance work.',
    landlordCta: 'Enter landlord demo →',
    manager: 'Manager workspace',
    managerDesc: 'See a portfolio-level view of units, tasks, verification, and participant activity.',
    managerCta: 'Enter manager demo →',
    operator: 'Maintenance operator workspace',
    operatorDesc: 'Manage assigned work orders, quotes, visits, field reports, and mock earnings.',
    operatorCta: 'Enter operator demo →',
    accountEyebrow: 'Create an account',
    accountTitle: 'Start with your role.',
    accountIntro: 'Choose the path that matches your work. Managers join an organization through an invitation from a landlord.',
    landlordEntry: 'I own or represent properties',
    landlordEntryDesc: 'Create your landlord account to add properties, manage rentals, and invite a property manager.',
    landlordMeta: 'Property owners · real-estate companies',
    landlordAction: 'Create landlord account',
    operatorEntry: 'I provide maintenance services',
    operatorEntryDesc: 'Create your operator profile to offer services and receive work across eligible properties.',
    operatorMeta: 'Plumbers · electricians · technicians',
    operatorAction: 'Join as maintenance operator',
    production: 'Production connection point:',
    productionDesc: 'Production portals and admin are separate apps and always begin with a login page.',
    api: 'Open the API readiness workbench →'
  };
  return `<section class="page content-page shell auth-page"><div class="auth-intro"><p class="eyebrow">${copy.eyebrow}</p><h1>${copy.title}</h1><p>${copy.intro}</p></div><section class="demo-access-section" aria-labelledby="demo-access-title"><div class="auth-section-heading"><div><p class="eyebrow">${copy.demoEyebrow}</p><h2 id="demo-access-title">${copy.demoTitle}</h2></div><p>${copy.demoIntro}</p></div><div class="demo-account-grid role-grid"><button class="demo-account" data-demo-role="tenant" type="button"><span class="audience-icon">01</span><h3>${copy.tenant}</h3><p>${copy.tenantDesc}</p><strong>${copy.tenantCta}</strong></button><button class="demo-account" data-demo-role="landlord" type="button"><span class="audience-icon">02</span><h3>${copy.landlord}</h3><p>${copy.landlordDesc}</p><strong>${copy.landlordCta}</strong></button><button class="demo-account" data-demo-role="manager" type="button"><span class="audience-icon">03</span><h3>${copy.manager}</h3><p>${copy.managerDesc}</p><strong>${copy.managerCta}</strong></button><button class="demo-account" data-demo-role="operator" type="button"><span class="audience-icon">04</span><h3>${copy.operator}</h3><p>${copy.operatorDesc}</p><strong>${copy.operatorCta}</strong></button></div></section><section class="account-entry-section" aria-labelledby="account-entry-title"><div class="auth-section-heading"><div><p class="eyebrow">${copy.accountEyebrow}</p><h2 id="account-entry-title">${copy.accountTitle}</h2></div><p>${copy.accountIntro}</p></div><div class="signup-entry-grid"><a class="signup-entry-card landlord-entry" href="#signup/landlord"><span class="entry-card-top"><span class="entry-icon" aria-hidden="true">L</span><span class="entry-arrow" aria-hidden="true">↗</span></span><span class="entry-card-body"><strong>${copy.landlordEntry}</strong><span>${copy.landlordEntryDesc}</span><small>${copy.landlordMeta}</small></span><span class="entry-card-action">${copy.landlordAction}<span aria-hidden="true">→</span></span></a><a class="signup-entry-card operator-entry" href="#signup/operator"><span class="entry-card-top"><span class="entry-icon" aria-hidden="true">M</span><span class="entry-arrow" aria-hidden="true">↗</span></span><span class="entry-card-body"><strong>${copy.operatorEntry}</strong><span>${copy.operatorEntryDesc}</span><small>${copy.operatorMeta}</small></span><span class="entry-card-action">${copy.operatorAction}<span aria-hidden="true">→</span></span></a></div></section><p class="notice auth-notice"><strong>${copy.production}</strong> ${copy.productionDesc} <a href="#demo/api">${copy.api}</a></p></section>`;
}

function signup(role) {
  const operator = role === 'operator';
  const label = operator ? 'Independent maintenance operator' : 'Landlord';
  return `<section class="page content-page shell auth-page"><div class="workspace-login-card signup-card"><p class="eyebrow">${label} signup</p><h1>Create your account.</h1><p class="muted">${operator ? 'Register your services once, then offer them across properties.' : 'Create your owner account, then add properties and invite your manager.'}</p><form class="form-grid" id="signup-form"><input type="hidden" name="role" value="${operator ? 'maintenance_operator' : 'landlord'}"><label>Full name<input name="name" required></label><label>Email address<input name="email" type="email" required></label><label>Phone number<input name="phone" type="tel" required></label>${operator ? '<label>Services offered<input name="services" placeholder="Plumbing, electrical, painting" required></label><label>Service coverage<input name="coverage" value="Any property on KEYFORTA" required></label>' : '<label>Company or ownership name<input name="organization" required></label>'}<button class="button copper" type="submit">Create account</button></form><a class="login-switch" href="#signin">Back to workspaces</a></div></section>`;
}

function rentalApplication(id) {
  const property = properties.find((item) => item.id === id) || properties[0];
  return `<section class="page content-page shell auth-page"><div class="application-card"><p class="eyebrow">Rental application</p><h1>Apply for ${property.title}.</h1><p class="muted">Complete this application for review by the property manager. This preview saves the submission in your browser only.</p><form class="form-grid" id="rental-application-form"><input type="hidden" name="propertyId" value="${property.id}"><label>Full name<input name="name" required></label><label>Email address<input name="email" type="email" required></label><label>Phone number<input name="phone" type="tel" required></label><label>Current address<input name="currentAddress" required></label><label>Number of occupants<input name="occupants" type="number" min="1" required></label><label>Employment or source of income<input name="incomeSource" required></label><label>Monthly income<input name="monthlyIncome" type="number" min="0" required></label><label>Desired move-in date<input name="moveInDate" type="date" required></label><label>References or additional information<textarea name="notes" required></textarea></label><label class="check-label"><input name="consent" type="checkbox" required> I confirm that the information is complete and may be reviewed by the manager.</label><button class="button copper" type="submit">Submit application for review</button><p class="form-status" role="status"></p></form></div></section>`;
}

function inviteManager() {
  return `<section class="page content-page shell auth-page"><div class="workspace-login-card signup-card"><p class="eyebrow">Landlord action</p><h1>Invite a property manager.</h1><p class="muted">The manager joins through your invitation; there is no open manager signup.</p><form class="form-grid" id="manager-invite-form"><label>Manager name<input name="name" required></label><label>Manager email<input name="email" type="email" required></label><label>Properties to manage<input name="properties" placeholder="Riverside apartment, Courtyard residence" required></label><button class="button copper" type="submit">Send invitation</button><p class="form-status" role="status"></p></form></div></section>`;
}

function offerServices() {
  return `<section class="page content-page shell auth-page"><div class="workspace-login-card signup-card"><p class="eyebrow">Operator services</p><h1>Offer services across properties.</h1><p class="muted">Your service offer can be discovered for any property. A manager still reviews and assigns each job.</p><form class="form-grid" id="service-offer-form"><label>Service category<input name="category" placeholder="Plumbing, electrical, generator service" required></label><label>Coverage<input name="coverage" value="Any property on KEYFORTA" required></label><label>Service description<textarea name="description" required></textarea></label><label>Starting rate<input name="startingRate" type="number" min="0" required></label><button class="button copper" type="submit">Publish service offer</button><p class="form-status" role="status"></p></form></div></section>`;
}

function workspaceLogin(role) {
  const labels = { tenant: 'Tenant', landlord: 'Landlord', manager: 'Property manager', operator: 'Independent maintenance operator' };
  const demoEmails = { tenant: 'tenant@test.keyforta.com', landlord: 'landlord@test.keyforta.com', manager: 'manager@test.keyforta.com', operator: 'operator@test.keyforta.com' };
  const label = labels[role];
  if (!label) return signIn();
  return `<section class="page content-page shell auth-page"><div class="workspace-login-card"><p class="eyebrow">${label}</p><h1>Sign in to continue.</h1><p class="muted">Use the demo account below, or enter any valid email.</p><form class="form-grid" id="workspace-login-form"><label>Email address<input name="email" type="email" autocomplete="email" placeholder="you@example.com" required></label><button class="button copper" type="submit">Continue</button><button class="button secondary demo-login-button" data-demo-email="${demoEmails[role]}" type="button">Use ${demoEmails[role]}</button></form><p class="login-demo-note">Demo only · No password is required · No credentials are sent to a server.</p><a class="login-switch" href="#signin">Choose another workspace</a></div></section>`;
}

function apiWorkbench() {
  const api = window.KeyfortaMockApi;
  const labels = lang === 'fr' ? { eyebrow: 'Contrat API', title: 'Chaque donnée a un chemin CRUD.', intro: 'Ce workbench montre les ressources, les champs, les autorisations et les commandes que le backend devra exposer. Toutes les opérations restent fictives et locales.', create: 'Créer', read: 'Lire', update: 'Modifier', remove: 'Supprimer', permissions: 'Autorisations par profil', fields: 'Champs', status: 'Les résultats des opérations apparaîtront ici.' } : { eyebrow: 'API contract', title: 'Every record has a CRUD path.', intro: 'This workbench shows the resources, fields, permissions, and commands the backend must expose. All operations remain synthetic and browser-local.', create: 'Create', read: 'Read', update: 'Update', remove: 'Delete', permissions: 'Permissions by profile', fields: 'Fields', status: 'Operation results will appear here.' };
  const roleNames = { tenant: lang === 'fr' ? 'Locataire' : 'Tenant', landlord: lang === 'fr' ? 'Propriétaire' : 'Landlord', property_manager: lang === 'fr' ? 'Gestionnaire' : 'Manager', maintenance_operator: lang === 'fr' ? 'Opérateur' : 'Operator' };
  return `<section class="page content-page shell api-page"><div class="auth-intro"><p class="eyebrow">${labels.eyebrow} <span class="demo-label">Mock data</span></p><h1>${labels.title}</h1><p>${labels.intro}</p></div><div class="api-contract-note"><strong>${lang === 'fr' ? 'Règle de connexion :' : 'Integration rule:'}</strong> ${lang === 'fr' ? 'remplacez l’adaptateur local par un client HTTP typé sans changer les ressources, les commandes ou les réponses.' : 'replace the local adapter with a typed HTTP client without changing resource names, commands, or response shapes.'}</div><div class="api-resource-grid">${Object.entries(api.definitions).map(([resource, definition]) => `<article class="api-resource" data-resource-card="${resource}"><div class="api-resource-head"><span class="number">${String(Object.keys(api.definitions).indexOf(resource) + 1).padStart(2, '0')}</span><div><h2>${definition.label}</h2><p>${resource}</p></div></div><h3>${labels.fields}</h3><p class="api-fields">${definition.fields.join(' · ')}</p><h3>${labels.permissions}</h3><div class="api-permissions">${Object.entries(api.permissions).map(([role, permissions]) => `<span title="${roleNames[role]}"><strong>${roleNames[role]}</strong>${permissions[resource] || 'none'}</span>`).join('')}</div><div class="api-crud"><button class="button secondary" data-api-crud="create" data-api-resource="${resource}" type="button">${labels.create}</button><button class="button secondary" data-api-crud="read" data-api-resource="${resource}" type="button">${labels.read}</button><button class="button secondary" data-api-crud="update" data-api-resource="${resource}" type="button">${labels.update}</button><button class="button secondary" data-api-crud="delete" data-api-resource="${resource}" type="button">${labels.remove}</button></div><p class="form-status api-status" role="status" aria-live="polite">${labels.status}</p></article>`).join('')}</div><p class="notice"><strong>${lang === 'fr' ? 'Sécurité :' : 'Security:'}</strong> ${lang === 'fr' ? 'les autorisations affichées sont une aide de conception ; le serveur doit appliquer l’isolation par organisation, rôle, relation et fenêtre d’accès.' : 'the displayed permissions are a design aid; the server must enforce organization, role, relationship, and time-window isolation.'}</p></section>`;
}

function workspaceActions(role) {
  const labels = (lang === 'fr' ? {
    tenant: ['Actions locataire', [['request-maintenance', 'Nouvelle demande de maintenance'], ['message-manager', 'Écrire au gestionnaire']]],
    landlord: ['Actions propriétaire', [['review-maintenance', 'Examiner la maintenance'], ['invite-manager', 'Inviter un gestionnaire']]],
    manager: ['Actions gestionnaire', [['assign-work-order', 'Attribuer un ordre de travail'], ['request-evidence', 'Demander une preuve']]],
    operator: ['Actions opérateur', [['accept-job', 'Accepter une tâche'], ['submit-quote', 'Envoyer un devis'], ['start-report', 'Commencer un rapport terrain'], ['offer-services', 'Proposer mes services']]]
  } : {
    tenant: ['Tenant actions', [['request-maintenance', 'Create maintenance request'], ['message-manager', 'Message manager']]],
    landlord: ['Landlord actions', [['review-maintenance', 'Review maintenance'], ['invite-manager', 'Invite property manager']]],
    manager: ['Manager actions', [['assign-work-order', 'Assign work order'], ['request-evidence', 'Request evidence']]],
    operator: ['Operator actions', [['accept-job', 'Accept assigned job'], ['submit-quote', 'Submit quote'], ['start-report', 'Start field report'], ['offer-services', 'Offer services across properties']]]
  })[role];
  if (!labels) return '';
  return `<section class="workspace-panel workspace-actions"><h2>${labels[0]}</h2><div class="action-list">${labels[1].map(([action, label]) => `<button class="button secondary action-button" data-api-action="${action}" ${action === 'invite-manager' ? 'data-invite-manager' : ''}${action === 'offer-services' ? 'data-offer-services' : ''} type="button">${label}</button>`).join('')}</div><p class="form-status action-status" role="status" aria-live="polite"></p></section>`;
}

function workspaceModule(role, section) {
  if (!section || section === 'dashboard') return '';
  const copy = {
    en: {
      rental: ['My rental', 'Review your current lease, payment schedule, documents, and messages in one place.'],
      maintenance: ['Maintenance', 'Track requests, service status, appointments, and completion evidence.'],
      messages: ['Messages', 'Keep conversations with the other participants connected to the relevant rental record.'],
      properties: ['Properties', 'Review properties, units, availability, and the records connected to each home.'],
      applications: ['Applications', 'Review rental applications and move each application through its next decision.'],
      'assigned-jobs': ['Assigned jobs', 'See service jobs assigned to you, with property context and visit windows.'],
      'quotes-reports': ['Quotes & reports', 'Prepare estimates, record field work, and submit completion evidence.'],
      services: ['Services', 'Offer your maintenance services across eligible KEYFORTA properties.']
    },
    fr: {
      rental: ['Ma location', 'Consultez votre contrat, vos paiements, vos documents et vos messages au même endroit.'],
      maintenance: ['Maintenance', 'Suivez les demandes, le statut du service, les rendez-vous et les preuves d’achèvement.'],
      messages: ['Messages', 'Gardez les échanges avec les autres participants liés au dossier locatif concerné.'],
      properties: ['Biens', 'Consultez les biens, les unités, les disponibilités et les dossiers liés à chaque logement.'],
      applications: ['Candidatures', 'Examinez les candidatures locatives et faites avancer chaque dossier vers la prochaine décision.'],
      'assigned-jobs': ['Tâches assignées', 'Consultez les interventions qui vous sont assignées, avec le contexte du bien et les horaires.'],
      'quotes-reports': ['Devis et rapports', 'Préparez les devis, consignez les travaux et envoyez les preuves d’achèvement.'],
      services: ['Services', 'Proposez vos services de maintenance pour les biens KEYFORTA concernés.']
    }
  }[lang][section];
  if (!copy) return '';
  return `<section class="workspace-module" aria-labelledby="workspace-module-title"><div><p class="eyebrow">${lang === 'fr' ? 'Module sélectionné' : 'Selected module'}</p><h2 id="workspace-module-title">${copy[0]}</h2><p>${copy[1]}</p></div><span class="module-chip">${lang === 'fr' ? 'Vue démo' : 'Demo view'}</span></section>`;
}

function workspace(role, section = 'dashboard') {
  const data = {
    tenant: { label: 'Tenant workspace', title: 'Your rental record at a glance.', subtitle: 'A focused view of viewings, payments, requests, and messages.', stats: [['Next rent', '$400', 'Due in 8 days'], ['Viewing', 'Requested', 'Riverside apartment'], ['Open request', '1', 'Water pump inspection']], sections: [['Upcoming activity', '<div class="activity-row"><span class="activity-icon">↗</span><div><strong>Viewing request</strong><p>Riverside apartment · Ngaliema</p></div><span class="status-pill">Pending</span></div><div class="activity-row"><span class="activity-icon">$</span><div><strong>Rent reminder</strong><p>Monthly rent · Mock account</p></div><span class="status-pill teal">Scheduled</span></div>'], ['Maintenance and messages', '<div class="activity-row"><span class="activity-icon">!</span><div><strong>Water pump inspection</strong><p>Submitted May 8 · Awaiting manager response</p></div><span class="status-pill">Open</span></div><div class="activity-row"><span class="activity-icon">•••</span><div><strong>Manager message</strong><p>“We will confirm the visit time shortly.”</p></div><span class="status-pill teal">New</span></div>']] },
    landlord: { label: 'Landlord workspace', title: 'See the health of your properties.', subtitle: 'A mock portfolio view for listings, occupancy, payments, and maintenance.', stats: [['Demo units', '6', 'Across Kinshasa'], ['Occupancy', '83%', '5 of 6 units'], ['Rent recorded', '$1,850', 'This mock month'], ['Open maintenance', '2', 'Needs attention']], sections: [['Portfolio activity', '<div class="activity-row"><span class="activity-icon">⌂</span><div><strong>Riverside apartment</strong><p>Ngaliema · Viewing requested</p></div><span class="status-pill teal">Active</span></div><div class="activity-row"><span class="activity-icon">✓</span><div><strong>Courtyard residence</strong><p>Limete · Tenant payment recorded</p></div><span class="status-pill teal">Recorded</span></div>'], ['Operations queue', '<div class="activity-row"><span class="activity-icon">!</span><div><strong>Water pump inspection</strong><p>Assigned to property manager</p></div><span class="status-pill">Open</span></div><div class="activity-row"><span class="activity-icon">+</span><div><strong>New property draft</strong><p>Review details before publishing</p></div><span class="status-pill">Draft</span></div>']] },
    manager: { label: 'Property manager workspace', title: 'Coordinate the work behind every home.', subtitle: 'A mock operating view for units, participants, verification, payments, and maintenance.', stats: [['Managed units', '14', 'Demo portfolio'], ['Occupancy', '93%', '13 of 14 units'], ['Verification queue', '3', 'Needs review'], ['Open work orders', '4', 'Across 3 properties']], sections: [['Priority queue', '<div class="activity-row"><span class="activity-icon">!</span><div><strong>Verification review</strong><p>2 owner records and 1 property record</p></div><span class="status-pill">3 pending</span></div><div class="activity-row"><span class="activity-icon">↗</span><div><strong>Viewing coordination</strong><p>Two requests need appointment times</p></div><span class="status-pill teal">Today</span></div>'], ['Recent operations', '<div class="activity-row"><span class="activity-icon">$</span><div><strong>Payment records</strong><p>Five mock receipts reconciled</p></div><span class="status-pill teal">Complete</span></div><div class="activity-row"><span class="activity-icon">•••</span><div><strong>Participant messages</strong><p>One new tenant message requires a reply</p></div><span class="status-pill teal">New</span></div>']] },
    operator: { label: 'Independent maintenance operator workspace', title: 'Keep every assigned job moving.', subtitle: 'A focused field-service view for work orders, estimates, visits, evidence, and mock earnings.', stats: [['Assigned jobs', '3', 'Across 2 properties'], ['Today’s visits', '2', 'One arrival confirmed'], ['Quotes awaiting review', '1', 'Submit before 5:00 PM'], ['Mock earnings', '$1,240', 'This demonstration month']], sections: [['Assigned work orders', '<div class="activity-row"><span class="activity-icon">!</span><div><strong>Water pump inspection</strong><p>Riverside apartment · Ngaliema · High priority</p></div><span class="status-pill">Assigned</span></div><div class="activity-row"><span class="activity-icon">↗</span><div><strong>Generator service</strong><p>Urban view residence · Gombe · Visit at 2:00 PM</p></div><span class="status-pill teal">Scheduled</span></div><div class="activity-row"><span class="activity-icon">✓</span><div><strong>Plumbing repair</strong><p>Family courtyard home · Lingwala · Customer confirmation pending</p></div><span class="status-pill teal">Review</span></div>'], ['Quotes and schedule', '<div class="activity-row"><span class="activity-icon">$</span><div><strong>Water pump estimate</strong><p>Materials and labor estimate requested by manager</p></div><span class="status-pill">Due today</span></div><div class="activity-row"><span class="activity-icon">⌚</span><div><strong>Next arrival window</strong><p>Today · 2:00–3:00 PM · Customer notified</p></div><span class="status-pill teal">Confirmed</span></div>'], ['Field reports and evidence', '<div class="activity-row"><span class="activity-icon">＋</span><div><strong>Completion report</strong><p>Add work performed, materials, cost, photos, and customer notes</p></div><span class="status-pill">Ready</span></div><div class="activity-row"><span class="activity-icon">✓</span><div><strong>Last completed job</strong><p>Electrical repair · $380 mock payout · Receipt available</p></div><span class="status-pill teal">Recorded</span></div>']] }
  }[role] || null;
  if (!data) return signIn();
  if (role === 'manager') { const applications = JSON.parse(localStorage.getItem('kf-rental-applications') || '[]'); if (applications.length) data.sections.unshift(['Rental applications', `<div class="activity-row"><span class="activity-icon">01</span><div><strong>${applications.length} application${applications.length === 1 ? '' : 's'} awaiting review</strong><p>${applications[applications.length - 1].name || 'Prospective tenant'} · ${applications[applications.length - 1].propertyId || 'Selected unit'}</p></div><span class="status-pill">Review</span></div>`]); }
  return `<section class="page content-page shell workspace-page"><div class="workspace-top"><div><p class="eyebrow">${data.label} <span class="demo-label">Mock data</span></p><h1>${data.title}</h1><p class="muted">${data.subtitle}</p></div><a class="button secondary" href="#signin">Change demo role</a></div><div class="workspace-banner"><strong>Demo workspace</strong><span>All records below are synthetic. Production authentication and backend services will replace this view. Operator access is limited to the operator profile and assigned jobs.</span></div>${workspaceModule(role, section)}<div class="workspace-stats">${data.stats.map((x) => `<div class="workspace-stat"><span>${x[0]}</span><strong>${x[1]}</strong><small>${x[2]}</small></div>`).join('')}</div><div class="workspace-grid">${data.sections.map((x) => `<section class="workspace-panel"><h2>${x[0]}</h2>${x[1]}</section>`).join('')}${workspaceActions(role)}</div></section>`;
}

function marketingVideoSection() {
  return `<section class="section video-section" aria-labelledby="video-title"><div class="shell video-layout"><div class="video-copy"><p class="eyebrow">KEYFORTA brand film</p><h2 id="video-title">A clearer way to find and manage home.</h2><p>See the thinking behind KEYFORTA: dependable rentals, practical details, and a shared record for the people involved.</p><p class="video-note"><span class="status-dot" aria-hidden="true"></span> Instrumental soundtrack only · Public preview</p></div><div class="video-frame"><video controls playsinline preload="metadata" poster="keyforta-hero.png" aria-describedby="video-description"><source src="keyforta-marketing-video.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English captions" src="keyforta-marketing-video.vtt" default>Your browser does not support video playback. <a href="keyforta-marketing-video.mp4">Download the video</a>.</video><p id="video-description" class="sr-only">A short KEYFORTA brand film introducing dependable rental discovery, clear costs, and shared records for Kinshasa, with an instrumental soundtrack and no spoken narration.</p></div></div></section><section class="section voice-section" id="voice" aria-labelledby="voice-title"><div class="shell voice-layout"><div class="voice-copy"><p class="eyebrow" data-i18n="voice_eyebrow">AI voice generator</p><h2 id="voice-title" data-i18n="voice_title">Give property information a voice.</h2><p data-i18n="voice_intro">Create a spoken preview from a property description, service update, or message. This public preview uses your browser and does not send text to a server.</p><div class="voice-wave" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div></div><div class="voice-card"><form id="voice-form" class="form-grid"><label><span data-i18n="voice_label">Text to speak</span><textarea id="voice-text" required>Welcome to KEYFORTA. Discover clearer rental information and manage every property relationship with confidence.</textarea></label><label><span data-i18n="voice_voice">Voice</span><select id="voice-choice"><option value="" data-i18n="voice_default">Browser default</option></select></label><div class="voice-actions"><button class="button copper" type="submit" data-i18n="voice_play">Generate voice preview</button><button class="button secondary" id="voice-stop" type="button" data-i18n="voice_stop">Stop preview</button></div><p class="form-status show" id="voice-status" role="status" aria-live="polite" data-i18n="voice_status_ready">Ready for a voice preview.</p></form></div></div></section>`;
}

function footer() {
  return `<footer class="site-footer"><div class="shell footer-grid"><div><a class="brand footer-brand" href="#home" aria-label="KEYFORTA home"><img class="footer-logo" src="keyforta-logo-reversed.svg" width="1400" height="500" alt="KEYFORTA"><img class="footer-wordmark" src="keyforta-wordmark-reversed.svg" width="1000" height="210" alt="KEYFORTA"></a><p data-i18n="footer_summary">Clear property information. Reliable rental records. Better relationships.</p></div><nav aria-label="Footer explore"><strong data-i18n="explore">Explore</strong><a href="#properties" data-i18n="nav_properties">Properties</a><a href="#how" data-i18n="nav_how">How it works</a><a href="#landlords" data-i18n="nav_landlords">For landlords</a><a href="#signin" data-i18n="sign_in">Demo sign in</a></nav><nav aria-label="Footer company"><strong data-i18n="company">Company</strong><a href="#trust" data-i18n="nav_trust">Trust & safety</a><a href="#faq">FAQ</a><a href="#contact" data-i18n="contact">Contact</a></nav><nav aria-label="Footer legal"><strong data-i18n="legal">Legal</strong><a href="#privacy" data-i18n="privacy">Privacy</a><a href="#terms" data-i18n="terms">Terms</a><span>© 2026 KEYFORTA</span></nav></div></footer>`;
}

function render() {
  const [name, id, section] = (location.hash || '#home').slice(1).split('/');
  const homeRoute = name === 'home' || name === 'voice';
  document.title = name === 'property' ? `${(properties.find((property) => property.id === id) || properties[0]).title} — KEYFORTA` : pageTitles[name] || pageTitles.home;
  app.innerHTML = homeRoute ? home() : name === 'properties' ? listings() : name === 'property' ? detail(id) : name === 'apply' ? rentalApplication(id) : name === 'how' ? how() : name === 'landlords' ? landlords() : name === 'trust' ? trust() : name === 'faq' ? faq() : name === 'contact' ? contact() : name === 'privacy' ? legal('privacy') : name === 'terms' ? legal('terms') : name === 'signin' ? signIn() : name === 'login' ? workspaceLogin(id) : name === 'signup' ? signup(id) : name === 'invite' ? inviteManager() : name === 'offer-services' ? offerServices() : name === 'demo' ? (id === 'api' ? apiWorkbench() : workspace(id, section)) : home();
  if (homeRoute) app.querySelector('#status')?.insertAdjacentHTML('beforebegin', marketingVideoSection());
  const footerMount = document.querySelector('#footer-mount');
  if (footerMount && !footerMount.firstElementChild) footerMount.innerHTML = footer();
  setWorkspaceShell(name === 'demo' && id !== 'api' ? id : null, section);
  const heading = app.querySelector('h1');
  if (heading) app.setAttribute('aria-label', (heading.innerText || heading.textContent).replace(/\s+/g, ' ').trim());
  app.querySelectorAll('.audience-icon, .activity-icon, .check-mark, .pending-mark, .number, .status-dot').forEach((icon) => icon.setAttribute('aria-hidden', 'true'));
  bind(homeRoute ? 'home' : name, id);
  translate();
  setActiveNav(name);
  scrollTo(0, 0);
  if (name === 'voice') requestAnimationFrame(() => document.querySelector('#voice')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  if (hasRendered) app.focus({ preventScroll: true });
  hasRendered = true;
}

function bind(name, id) {
  document.querySelectorAll('[data-open-access]').forEach((button) => button.addEventListener('click', () => { document.querySelector('#access-interest').value = button.dataset.propertyInterest || ''; dialog.showModal(); }));
  document.querySelectorAll('.demo-form').forEach((form) => form.addEventListener('submit', (event) => { event.preventDefault(); save('kf-demo-submissions', Object.fromEntries(new FormData(form))); const status = form.querySelector('.form-status'); status.textContent = lang === 'fr' ? 'Enregistré dans ce navigateur pour la démonstration. Rien n’a été envoyé à un serveur.' : 'Saved in this browser for demonstration. It was not sent to a server.'; status.classList.add('show'); form.reset(); }));
  document.querySelectorAll('[data-demo-role]').forEach((button) => button.addEventListener('click', () => { location.hash = `#login/${button.dataset.demoRole}`; }));
  document.querySelector('#workspace-login-form')?.addEventListener('submit', (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); localStorage.setItem('kf-demo-session', JSON.stringify({ role: id, email: values.email, createdAt: new Date().toISOString() })); location.hash = `#demo/${id}`; });
  document.querySelector('.demo-login-button')?.addEventListener('click', (event) => { const form = document.querySelector('#workspace-login-form'); form.querySelector('[name="email"]').value = event.currentTarget.dataset.demoEmail; form.requestSubmit(); });
  document.querySelector('#signup-form')?.addEventListener('submit', (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); save('kf-signups', values); location.hash = `#login/${id}`; });
  document.querySelector('#rental-application-form')?.addEventListener('submit', (event) => { event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form)); save('kf-rental-applications', { ...values, status: 'submitted_for_manager_review' }); const status = form.querySelector('.form-status'); status.textContent = lang === 'fr' ? 'Candidature envoyée pour examen par le gestionnaire dans cette démo.' : 'Application submitted for manager review in this demo.'; status.classList.add('show'); form.reset(); });
  document.querySelector('#manager-invite-form')?.addEventListener('submit', (event) => { event.preventDefault(); const form = event.currentTarget; save('kf-manager-invitations', Object.fromEntries(new FormData(form))); const status = form.querySelector('.form-status'); status.textContent = lang === 'fr' ? 'Invitation enregistrée dans cette démo.' : 'Invitation saved in this demo.'; status.classList.add('show'); });
  document.querySelector('#service-offer-form')?.addEventListener('submit', (event) => { event.preventDefault(); const form = event.currentTarget; save('kf-service-offers', Object.fromEntries(new FormData(form))); const status = form.querySelector('.form-status'); status.textContent = lang === 'fr' ? 'Offre de services publiée dans cette démo.' : 'Service offer published in this demo.'; status.classList.add('show'); });
  document.querySelectorAll('[data-invite-manager]').forEach((button) => button.addEventListener('click', () => { location.hash = '#invite/manager'; }));
  document.querySelectorAll('[data-offer-services]').forEach((button) => button.addEventListener('click', () => { location.hash = '#offer-services/operator'; }));
  document.querySelector('[data-workspace-signout]')?.addEventListener('click', () => { localStorage.removeItem('kf-demo-session'); location.hash = '#signin'; });
  document.querySelectorAll('[data-api-action]').forEach((button) => button.addEventListener('click', () => {
    const role = (location.hash || '#demo/unknown').split('/')[1] || 'unknown';
    save('kf-workflow-events', { action: button.dataset.apiAction, role, source: 'mock-ui' });
    const status = button.closest('.workspace-panel')?.querySelector('.action-status');
    if (status) { status.textContent = lang === 'fr' ? 'Action enregistrée dans la démonstration. Cette interaction deviendra un appel API.' : 'Action saved in the demonstration. This interaction will become an API call.'; status.classList.add('show'); }
  }));
  document.querySelectorAll('[data-api-crud]').forEach((button) => button.addEventListener('click', () => {
    const api = window.KeyfortaMockApi; const resource = button.dataset.apiResource; const operation = button.dataset.apiCrud; const card = button.closest('[data-resource-card]'); const status = card?.querySelector('.api-status');
    const sample = { profiles: { role: 'maintenance_operator', displayName: 'New mock profile', email: 'new@example.test' }, properties: { name: 'New mock property', address: 'Gombe', ownerId: 'profile-owner-001' }, units: { propertyId: 'property-riverside', label: 'Unit mock' }, leases: { unitId: 'unit-riverside-01', tenantId: 'profile-tenant-001', status: 'draft' }, charges: { leaseId: 'lease-riverside-001', type: 'rent', amount: 400 }, payments: { leaseId: 'lease-riverside-001', amount: 400, type: 'rent' }, viewingRequests: { propertyId: 'property-riverside', requesterId: 'profile-tenant-001', status: 'requested' }, maintenanceRequests: { propertyId: 'property-riverside', requesterId: 'profile-tenant-001', title: 'Mock maintenance request', status: 'submitted' }, maintenanceQuotes: { maintenanceRequestId: 'maintenance-pump-001', operatorId: 'profile-operator-001', amount: 100, status: 'submitted' }, maintenanceReports: { maintenanceRequestId: 'maintenance-pump-001', operatorId: 'profile-operator-001', status: 'draft' }, documents: { ownerId: 'profile-tenant-001', type: 'identity', status: 'submitted' }, messages: { conversationId: 'conversation-001', senderId: 'profile-manager-001', body: 'Mock message' }, notifications: { recipientId: 'profile-tenant-001', type: 'maintenance', title: 'Mock notification' }, auditEvents: { actorId: 'profile-manager-001', action: 'read', resource } }[resource];
    try {
      const first = api.list(resource).items[0]; let result;
      if (operation === 'create') result = api.create(resource, sample, `crud:${operation}`);
      if (operation === 'read') result = api.list(resource);
      if (operation === 'update') result = first ? api.update(resource, first.id, { mockUpdated: true }, `crud:${operation}`) : { message: 'No record available to update' };
      if (operation === 'delete') result = first && resource !== 'auditEvents' ? api.remove(resource, first.id, `crud:${operation}`) : { message: 'No deletable record available' };
      if (status) { status.textContent = `${operation.toUpperCase()} ${resource}: ${JSON.stringify(result).slice(0, 180)}${JSON.stringify(result).length > 180 ? '…' : ''}`; status.classList.add('show'); }
    } catch (error) { if (status) { status.textContent = `${operation.toUpperCase()} ${resource}: ${error.message}`; status.classList.add('show'); } }
  }));
  if (name === 'home') {
    const voiceForm = document.querySelector('#voice-form');
    const voiceChoice = document.querySelector('#voice-choice');
    const voiceStatus = document.querySelector('#voice-status');
    const voiceStop = document.querySelector('#voice-stop');
    const populateVoices = () => {
      if (!('speechSynthesis' in window)) return;
      const current = voiceChoice.value;
      const voices = window.speechSynthesis.getVoices();
      voiceChoice.innerHTML = `<option value="" data-i18n="voice_default">${translations[lang].voice_default}</option>`;
      voices.forEach((voice, index) => { const option = document.createElement('option'); option.value = String(index); option.textContent = `${voice.name} (${voice.lang})`; voiceChoice.appendChild(option); });
      if ([...voiceChoice.options].some((option) => option.value === current)) voiceChoice.value = current;
    };
    populateVoices();
    if ('speechSynthesis' in window) window.speechSynthesis.addEventListener('voiceschanged', populateVoices);
    voiceForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!('speechSynthesis' in window)) { voiceStatus.textContent = translations[lang].voice_status_unavailable; return; }
      const text = document.querySelector('#voice-text').value.trim();
      if (!text) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang === 'fr' ? 'fr-FR' : 'en-US';
      const selectedVoice = window.speechSynthesis.getVoices()[Number(voiceChoice.value)];
      if (selectedVoice) { utterance.voice = selectedVoice; utterance.lang = selectedVoice.lang; }
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      voiceStatus.textContent = translations[lang].voice_status_playing;
    });
    voiceStop.addEventListener('click', () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); voiceStatus.textContent = translations[lang].voice_status_stopped; });
  }
  if (name === 'properties') {
    const form = document.querySelector('#filters'); const output = document.querySelector('#property-results'); const count = document.querySelector('#results-count');
    const show = () => { const data = new FormData(form); const area = (data.get('area') || '').toLowerCase(); const beds = Number(data.get('beds') || 0); const max = Number(data.get('max') || 99999); const sort = data.get('sort') || 'recommended'; let items = properties.filter((p) => (p.area + ' Kinshasa').toLowerCase().includes(area) && p.beds >= beds && p.price <= max); if (sort === 'price-low') items.sort((a, b) => a.price - b.price); if (sort === 'price-high') items.sort((a, b) => b.price - a.price); if (sort === 'beds') items.sort((a, b) => b.beds - a.beds || a.price - b.price); count.textContent = lang === 'fr' ? `${items.length} bien${items.length === 1 ? '' : 's'} de démonstration` : `${items.length} demonstration ${items.length === 1 ? 'property' : 'properties'}`; output.innerHTML = items.length ? items.map(propertyCard).join('') : `<div class="empty">${lang === 'fr' ? 'Aucun bien fictif ne correspond à ces filtres.' : 'No mock properties match these filters.'}</div>`; };
    form.addEventListener('submit', (event) => { event.preventDefault(); show(); });
    document.querySelector('#reset-filters').addEventListener('click', () => { form.reset(); show(); });
    show();
  }
}

function setActiveNav(name) { const route = name === 'property' ? 'properties' : name === 'demo' ? 'signin' : name; document.querySelectorAll('#main-nav a[data-route]').forEach((link) => { const active = link.dataset.route === route; link.classList.toggle('active', active); if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); }); }

function setWorkspaceShell(role, section = 'dashboard') {
  const header = document.querySelector('.site-header');
  const nav = document.querySelector('#main-nav');
  const footerMount = document.querySelector('#footer-mount');
  const roles = { tenant: 'Tenant', landlord: 'Landlord', manager: 'Property manager', operator: 'Maintenance operator' };
  const roleLabel = roles[role];
  const workspace = Boolean(roleLabel);
  header.classList.toggle('workspace-header', workspace);
  footerMount.classList.toggle('workspace-footer-hidden', workspace);
  const brandLink = document.querySelector('.site-header .brand');
  brandLink.href = workspace ? `#demo/${role}` : '#home';
  brandLink.setAttribute('aria-label', workspace ? `${roleLabel} workspace` : 'KEYFORTA home');
  if (!workspace) {
    nav.innerHTML = '<a href="#properties" data-route="properties" data-i18n="nav_properties">Properties</a><a href="#how" data-route="how" data-i18n="nav_how">How it works</a><a href="#trust" data-route="trust" data-i18n="nav_trust">Trust & safety</a><a href="#voice" data-route="voice">AI voice</a><a href="#faq" data-route="faq">FAQ</a><a href="#contact" data-route="contact" data-i18n="contact">Contact</a><a href="#signin" data-route="signin" data-i18n="sign_in_short">Sign in</a><button class="language" id="language-toggle" type="button" aria-label="Switch to French">FR</button><button class="button small" data-open-access type="button" data-i18n="request_access">Request access</button>';
    document.querySelector('#language-toggle')?.addEventListener('click', toggleLanguage);
    return;
  }
  const menuLabels = {
    en: { dashboard: 'Dashboard', rental: 'My rental', maintenance: 'Maintenance', messages: 'Messages', properties: 'Properties', applications: 'Applications', 'assigned-jobs': 'Assigned jobs', 'quotes-reports': 'Quotes & reports', services: 'Services' },
    fr: { dashboard: 'Tableau de bord', rental: 'Ma location', maintenance: 'Maintenance', messages: 'Messages', properties: 'Biens', applications: 'Candidatures', 'assigned-jobs': 'Tâches assignées', 'quotes-reports': 'Devis et rapports', services: 'Services' }
  }[lang];
  const menuDefinitions = {
    tenant: [['dashboard', '#demo/tenant'], ['rental', '#demo/tenant/rental'], ['maintenance', '#demo/tenant/maintenance'], ['messages', '#demo/tenant/messages']],
    landlord: [['dashboard', '#demo/landlord'], ['properties', '#demo/landlord/properties'], ['applications', '#demo/landlord/applications'], ['maintenance', '#demo/landlord/maintenance']],
    manager: [['dashboard', '#demo/manager'], ['applications', '#demo/manager/applications'], ['properties', '#demo/manager/properties'], ['maintenance', '#demo/manager/maintenance']],
    operator: [['dashboard', '#demo/operator'], ['assigned-jobs', '#demo/operator/assigned-jobs'], ['quotes-reports', '#demo/operator/quotes-reports'], ['services', '#demo/operator/services']]
  }[role];
  nav.innerHTML = `<span class="workspace-context">${roleLabel}</span>${menuDefinitions.map(([key, href]) => `<a href="${href}" data-workspace-section="${key}"${(section || 'dashboard') === key ? ' class="active" aria-current="page"' : ''}>${menuLabels[key]}</a>`).join('')}<button class="language" id="language-toggle" type="button" aria-label="Switch to French">FR</button><button class="workspace-signout" data-workspace-signout type="button">${lang === 'fr' ? 'Se déconnecter' : 'Sign out'}</button>`;
  document.querySelector('#language-toggle')?.addEventListener('click', toggleLanguage);
}

function translate() { document.documentElement.lang = lang; const languageToggle = document.querySelector('#language-toggle'); languageToggle.textContent = lang === 'en' ? 'FR' : 'EN'; languageToggle.setAttribute('aria-label', lang === 'en' ? 'Switch to French' : 'Passer en anglais'); document.querySelectorAll('[data-i18n]').forEach((element) => { const key = element.dataset.i18n; if (translations[lang][key]) element.textContent = translations[lang][key]; }); }

function toggleLanguage() {
  const scrollPosition = window.scrollY;
  lang = lang === 'en' ? 'fr' : 'en';
  localStorage.setItem('kf-language', lang);
  render();
  requestAnimationFrame(() => window.scrollTo(0, scrollPosition));
}

document.querySelector('.menu-button').addEventListener('click', (event) => { const nav = document.querySelector('#main-nav'); const open = nav.classList.toggle('open'); event.currentTarget.setAttribute('aria-expanded', open); event.currentTarget.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation'); event.currentTarget.textContent = open ? 'Close' : 'Menu'; });
document.querySelector('#main-nav').addEventListener('click', () => { document.querySelector('#main-nav').classList.remove('open'); const menuButton = document.querySelector('.menu-button'); menuButton.setAttribute('aria-expanded', 'false'); menuButton.setAttribute('aria-label', 'Open navigation'); menuButton.textContent = 'Menu'; });
document.querySelector('#language-toggle').addEventListener('click', toggleLanguage);
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
document.querySelector('#access-form').addEventListener('submit', (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); const reference = `KF-${Date.now().toString(36).toUpperCase()}`; save('kf-access-requests', { ...values, reference }); const status = event.currentTarget.querySelector('.form-status'); status.textContent = lang === 'fr' ? `Demande enregistrée pour la démonstration. Référence ${reference}. Rien n’a été envoyé à un serveur.` : `Request saved for demonstration. Reference ${reference}. It was not sent to a server.`; status.classList.add('show'); event.currentTarget.reset(); document.querySelector('#access-interest').value = values.interest || ''; });
addEventListener('hashchange', render);
render();

/* Complete bilingual public experience. Content remains English-first in source, while every
   rendered route, control, status, and property record can be switched between English and French. */
const phraseTranslations = {
  'A better way home': 'Une meilleure façon de se loger',
  'Rent with clarity.': 'Louez en toute clarté.',
  'Manage with confidence.': 'Gérez en toute confiance.',
  'Discover dependable rentals and keep the important parts of a rental relationship clear—from viewing through monthly payments.': 'Découvrez des locations fiables et gardez les éléments essentiels de la relation locative clairs, de la visite aux paiements mensuels.',
  'Browse properties': 'Parcourir les biens',
  'Request access': 'Demander un accès',
  'Apartment buildings in Kinshasa at golden hour': 'Immeubles d’habitation à Kinshasa au coucher du soleil',
  'Public preview': 'Aperçu public',
  'All listings, accounts, payments, and messages are simulated with mock data.': 'Les annonces, comptes, paiements et messages sont simulés avec des données fictives.',
  'See what is included': 'Voir ce qui est inclus',
  'Mock listings': 'Annonces fictives',
  'Explore the future experience': 'Découvrez l’expérience future',
  'Clear costs': 'Coûts transparents',
  'Rent and terms up front': 'Loyer et conditions affichés à l’avance',
  'For everyone': 'Pour tout le monde',
  'Tenants, owners and managers': 'Locataires, propriétaires et gestionnaires',
  'Tenants, owners, managers and operators': 'Locataires, propriétaires, gestionnaires et opérateurs',
  'Kinshasa first': 'Kinshasa en premier',
  'Built for local realities': 'Conçu pour les réalités locales',
  'Featured homes': 'Biens à découvrir',
  'Start with what matters.': 'Commencez par l’essentiel.',
  'Explore demonstration listings with example availability, verification signals, rental terms, and viewing requests.': 'Explorez des annonces de démonstration avec disponibilité indicative, indices de vérification, conditions locatives et demandes de visite.',
  'View all properties': 'Voir tous les biens',
  'Choose your path': 'Choisissez votre parcours',
  'One platform, three starting points.': 'Une plateforme, trois points de départ.',
  'One platform, four starting points.': 'Une plateforme, quatre points de départ.',
  'Start with the part of the rental journey that matters most to you.': 'Commencez par l’étape de la location qui compte le plus pour vous.',
  'Find a home': 'Trouver un logement',
  'Compare homes, understand the full cost, and request a viewing.': 'Comparez les logements, comprenez le coût total et demandez une visite.',
  'Browse properties →': 'Parcourir les biens →',
  'List a property': 'Publier un bien',
  'Present your homes clearly and prepare for better tenant conversations.': 'Présentez clairement vos logements et préparez de meilleurs échanges avec les locataires.',
  'For landlords →': 'Pour les propriétaires →',
  'Manage rentals': 'Gérer les locations',
  'Review a mock workspace for units, agreements, payments, and maintenance.': 'Découvrez un espace de démonstration pour les unités, contrats, paiements et opérations de maintenance.',
  'Open manager demo →': 'Ouvrir la démo gestionnaire →',
  'One shared standard': 'Un standard partagé',
  'A clearer rental journey.': 'Un parcours locatif plus clair.',
  'Compare homes with practical details, full monthly costs, and availability.': 'Comparez les logements avec leurs détails pratiques, leurs coûts mensuels complets et leur disponibilité.',
  'See what has been submitted, reviewed, and still requires confirmation.': 'Voyez ce qui a été soumis, vérifié et doit encore être confirmé.',
  'Keep payments, receipts, maintenance, and communication in one trusted record.': 'Conservez paiements, reçus, maintenance et échanges dans un dossier de confiance unique.',
  'Complete public preview': 'Aperçu public complet',
  'See the product before the connection.': 'Découvrez le produit avant sa connexion.',
  'The public layer is ready to demonstrate the core journey while your production services are connected.': 'La version publique présente le parcours essentiel pendant la connexion de vos services de production.',
  'Visitors can explore': 'Les visiteurs peuvent explorer',
  'Mock listings, filters, sorting, and detail pages': 'Annonces fictives, filtres, tri et pages de détails',
  'Availability, costs, terms, and verification signals': 'Disponibilités, coûts, conditions et indices de vérification',
  'Viewing, property-interest, and contact requests': 'Demandes de visite, d’intérêt et de contact',
  'Tenant, landlord, and manager demo workspaces': 'Espaces de démonstration locataire, propriétaire et gestionnaire',
  'Tenant, landlord, manager, and operator demo workspaces': 'Espaces de démonstration locataire, propriétaire, gestionnaire et opérateur',
  'AI voice previews for property and service messages': 'Aperçus vocaux IA pour les biens et messages de service',
  'Production services to connect': 'Services de production à connecter',
  'Backend, database, and live inventory': 'Backend, base de données et inventaire en temps réel',
  'Authentication, roles, and verification evidence': 'Authentification, rôles et preuves de vérification',
  'Payments, receipts, notifications, and email': 'Paiements, reçus, notifications et e-mails',
  'Maintenance messaging and final legal documents': 'Messages de maintenance et documents juridiques définitifs',
  'Stay close to the launch': 'Restez proche du lancement',
  'Help shape the first connected version.': 'Contribuez à façonner la première version connectée.',
  'Request early access': 'Demander un accès anticipé',
  'Property discovery': 'Recherche de biens',
  'Mock data': 'Données fictives',
  'Find a home that fits.': 'Trouvez un logement qui vous correspond.',
  'Compare demonstration listings. No property shown here is currently being offered for rent.': 'Comparez des annonces de démonstration. Aucun bien présenté ici n’est actuellement proposé à la location.',
  'Neighborhood': 'Quartier',
  'e.g. Ngaliema': 'ex. Ngaliema',
  'Bedrooms': 'Chambres',
  'Any': 'Tous',
  'Maximum rent': 'Loyer maximal',
  'Sort by': 'Trier par',
  'Recommended': 'Recommandé',
  'Price: low to high': 'Prix : du moins cher au plus cher',
  'Price: high to low': 'Prix : du plus cher au moins cher',
  'Apply filters': 'Appliquer les filtres',
  'Reset': 'Réinitialiser',
  'Back to properties': 'Retour aux biens',
  'Demonstration listing:': 'Annonce de démonstration :',
  'This property is mock data. It cannot be reserved, rented, or paid for through KEYFORTA yet.': 'Ce bien est une donnée fictive. Il ne peut pas encore être réservé, loué ou payé sur KEYFORTA.',
  'bedrooms': 'chambres',
  'bedroom': 'chambre',
  'bathrooms': 'salles de bains',
  'bathroom': 'salle de bains',
  'neighborhood': 'quartier',
  'verification': 'vérification',
  'About this home': 'À propos de ce logement',
  'What is included': 'Ce qui est inclus',
  'Verification preview': 'Aperçu de la vérification',
  'Ownership authority: pending production evidence': 'Autorité de propriété : preuve de production en attente',
  'Participant identity: checked during onboarding': 'Identité du participant : vérifiée lors de l’intégration',
  'Illustrative move-in costs': 'Coûts indicatifs d’installation',
  'Monthly rent': 'Loyer mensuel',
  'Example deposit (4 months)': 'Dépôt indicatif (4 mois)',
  'Shown before commitment': 'Affiché avant tout engagement',
  'Mock figures only. Final terms will come from the connected agreement.': 'Chiffres fictifs uniquement. Les conditions finales proviendront du contrat connecté.',
  'Request a viewing': 'Demander une visite',
  'How verification works →': 'Comment fonctionne la vérification →',
  'How it works': 'Fonctionnement',
  'A rental process everyone can understand.': 'Un processus locatif compréhensible par tous.',
  'KEYFORTA is designed around a shared record: the same property, terms, payments, and requests can be understood by the people who are allowed to see them.': 'KEYFORTA repose sur un dossier partagé : les mêmes biens, conditions, paiements et demandes peuvent être compris par les personnes autorisées à les consulter.',
  'Search': 'Rechercher',
  'Browse clear listings and compare location, price, layout, amenities, and availability.': 'Parcourez des annonces claires et comparez emplacement, prix, configuration, équipements et disponibilité.',
  'Verify': 'Vérifier',
  'Review property, authority, and participant verification signals before arranging a viewing.': 'Examinez les indices de vérification du bien, de l’autorité et du participant avant d’organiser une visite.',
  'Visit': 'Visiter',
  'Request a viewing and keep appointment details in one place.': 'Demandez une visite et gardez les détails du rendez-vous au même endroit.',
  'Agree': 'S’entendre',
  'Review rent, deposit, responsibilities, and documents before signing.': 'Examinez le loyer, le dépôt, les responsabilités et les documents avant de signer.',
  'Pay': 'Payer',
  'Record payments and receipts so both sides share the same history.': 'Enregistrez paiements et reçus afin que les deux parties partagent le même historique.',
  'Maintain': 'Entretenir',
  'Submit requests, track progress, and preserve communication through move-out.': 'Soumettez des demandes, suivez leur avancement et conservez les échanges jusqu’au départ.',
  'For landlords and managers': 'Pour les propriétaires et gestionnaires',
  'Put every property relationship in view.': 'Gardez chaque relation immobilière sous contrôle.',
  'Prepare listings, organize tenant information, and establish a reliable operational record.': 'Préparez vos annonces, organisez les informations des locataires et établissez un dossier opérationnel fiable.',
  'Consistent property and unit records': 'Dossiers cohérents pour les biens et les unités',
  'Clear rent, deposit, and availability details': 'Détails clairs sur le loyer, le dépôt et la disponibilité',
  'Viewing and application workflows': 'Parcours de visite et de candidature',
  'Future payment and maintenance tracking': 'Suivi futur des paiements et de la maintenance',
  'Listings': 'Annonces',
  'Payments': 'Paiements',
  'Maintenance': 'Maintenance',
  'Demo': 'Démo',
  'This sends a local mock request only. It does not publish a property.': 'Ceci envoie uniquement une demande fictive locale. Aucun bien n’est publié.',
  'Owner or company name': 'Nom du propriétaire ou de l’entreprise',
  'Property location': 'Emplacement du bien',
  'Number of units': 'Nombre d’unités',
  'Tell us about the property': 'Parlez-nous du bien',
  'Submit property interest': 'Envoyer l’intérêt pour ce bien',
  'Trust & safety': 'Confiance et sécurité',
  'Clarity before commitment.': 'La clarté avant l’engagement.',
  'KEYFORTA is being designed to reduce ambiguity across listings, people, agreements, payments, and maintenance. The signals below are examples of how a connected workflow can communicate what is known and what still needs evidence.': 'KEYFORTA est conçu pour réduire les ambiguïtés concernant les annonces, les personnes, les contrats, les paiements et la maintenance. Les indices ci-dessous montrent comment un parcours connecté peut communiquer ce qui est connu et ce qui nécessite encore des preuves.',
  'Collect': 'Collecter',
  'Gather property details, ownership or management authority, identity information, and supporting evidence.': 'Rassemblez les détails du bien, l’autorité de propriété ou de gestion, les informations d’identité et les justificatifs.',
  'Review': 'Examiner',
  'Record who reviewed each item, when it was reviewed, and whether more information is required.': 'Enregistrez qui a examiné chaque élément, quand et si des informations supplémentaires sont nécessaires.',
  'Communicate': 'Communiquer',
  'Show participants clear status labels and a safe path to report a concern before money changes hands.': 'Affichez des statuts clairs et un moyen sûr de signaler un problème avant tout transfert d’argent.',
  'Safety principles': 'Principes de sécurité',
  'Transparent terms.': 'Conditions transparentes.',
  'Rent, deposits, responsibilities, fees, and important dates should be visible before a tenant commits.': 'Le loyer, les dépôts, les responsabilités, les frais et les dates importantes doivent être visibles avant l’engagement du locataire.',
  'Shared records.': 'Dossiers partagés.',
  'Agreements, receipts, requests, and important communication should be preserved for the appropriate participants.': 'Les contrats, reçus, demandes et échanges importants doivent être conservés pour les participants concernés.',
  'No false certainty.': 'Aucune fausse certitude.',
  'A submitted document is not the same as a verified claim. Mock data is never a rental offer.': 'Un document soumis n’est pas la même chose qu’une déclaration vérifiée. Une donnée fictive n’est jamais une offre locative.',
  'Stay safe:': 'Restez prudents :',
  'Never send money based solely on a public listing. Confirm the property, recipient, and written terms through a trusted channel.': 'N’envoyez jamais d’argent sur la seule base d’une annonce publique. Confirmez le bien, le destinataire et les conditions écrites par un canal de confiance.',
  'Frequently asked questions': 'Questions fréquentes',
  'Answers before you begin.': 'Les réponses avant de commencer.',
  'Are these properties available?': 'Ces biens sont-ils disponibles ?',
  'No. Every current listing is mock data created to demonstrate the future public experience.': 'Non. Toutes les annonces actuelles sont des données fictives créées pour présenter l’expérience publique future.',
  'Can I pay rent through this website?': 'Puis-je payer mon loyer sur ce site ?',
  'Not yet. The preview shows where payments and receipts will appear, but no money is collected.': 'Pas encore. L’aperçu montre où apparaîtront les paiements et reçus, mais aucun argent n’est collecté.',
  'How will properties be verified?': 'Comment les biens seront-ils vérifiés ?',
  'The future workflow will collect property details, ownership or management authority, and evidence before displaying a verification status.': 'Le parcours futur recueillera les détails du bien, l’autorité de propriété ou de gestion et les preuves avant d’afficher un statut de vérification.',
  'Can a landlord list multiple units?': 'Un propriétaire peut-il publier plusieurs unités ?',
  'Yes. The planned platform supports properties with one or many units and a dedicated management workspace.': 'Oui. La plateforme prévue prend en charge les biens composés d’une ou plusieurs unités et un espace de gestion dédié.',
  'Will KEYFORTA support French?': 'KEYFORTA prendra-t-il en charge le français ?',
  'Yes. The public experience includes an initial French-language mode, with broader translation coverage planned for the connected product.': 'Oui. L’expérience publique comprend un mode français initial ; la version connectée offrira une couverture linguistique plus large.',
  'How are deposits handled?': 'Comment les dépôts sont-ils gérés ?',
  'Deposit rules will be stated clearly in each agreement, including amount, payment, permitted deductions, and final disposition.': 'Les règles relatives aux dépôts seront clairement indiquées dans chaque contrat : montant, paiement, retenues autorisées et restitution finale.',
  'Will tenants receive notifications?': 'Les locataires recevront-ils des notifications ?',
  'The connected product is planned to support viewing updates, payment reminders, maintenance updates, and important account notifications.': 'Le produit connecté doit prendre en charge les mises à jour de visites, rappels de paiement, informations de maintenance et notifications importantes du compte.',
  'Can I report a concern?': 'Puis-je signaler un problème ?',
  'Yes. Use the contact page for a safety concern in this preview. A connected product will add participant-specific reporting and case tracking.': 'Oui. Utilisez la page Contact pour signaler un problème de sécurité dans cet aperçu. Le produit connecté ajoutera le signalement par participant et le suivi des dossiers.',
  'How can we help?': 'Comment pouvons-nous vous aider ?',
  'Use this demonstration form for general questions, launch interest, or safety concerns.': 'Utilisez ce formulaire de démonstration pour vos questions générales, votre intérêt pour le lancement ou un problème de sécurité.',
  'Email': 'E-mail',
  'Initial market': 'Marché initial',
  'Kinshasa, Democratic Republic of the Congo': 'Kinshasa, République démocratique du Congo',
  'Mock-data notice': 'Avis sur les données fictives',
  'Messages are saved only in this browser until email delivery is connected.': 'Les messages sont enregistrés uniquement dans ce navigateur jusqu’à la connexion de la livraison des e-mails.',
  'Topic': 'Sujet',
  'General question': 'Question générale',
  'Tenant support': 'Assistance locataire',
  'Landlord inquiry': 'Demande de propriétaire',
  'Report a concern': 'Signaler un problème',
  'Message': 'Message',
  'Send message': 'Envoyer le message',
  'Legal': 'Juridique',
  'Privacy notice': 'Avis de confidentialité',
  'Terms of use': 'Conditions d’utilisation',
  'Draft for review:': 'Projet à relire :',
  'This text is a public-preview placeholder and must be replaced with the finalized company, backend, data flows, retention rules, and applicable-law language before commercial launch.': 'Ce texte est un espace réservé pour l’aperçu public. Il devra être remplacé par les informations définitives sur l’entreprise, le backend, les flux de données, la conservation et le droit applicable avant le lancement commercial.',
  'Information collected': 'Informations collectées',
  'This demonstration may store form entries, mock requests, and language preference in your browser. It does not transmit them to a KEYFORTA server.': 'Cette démonstration peut enregistrer dans votre navigateur des formulaires, demandes fictives et préférence linguistique. Elle ne transmet rien à un serveur KEYFORTA.',
  'Cookies and local storage': 'Cookies et stockage local',
  'The demonstration uses local storage for language preference and locally submitted mock forms. A connected product will publish its final cookie, analytics, and retention disclosures.': 'La démonstration utilise le stockage local pour la préférence linguistique et les formulaires fictifs soumis localement. Le produit connecté publiera ses informations définitives sur les cookies, l’analyse et la conservation.',
  'Your choices': 'Vos choix',
  'You can clear locally stored information through your browser settings. Contact and account rights will be described in the finalized privacy notice.': 'Vous pouvez effacer les informations stockées localement dans les paramètres de votre navigateur. Les droits relatifs au contact et au compte seront décrits dans l’avis de confidentialité définitif.',
  'Demonstration only': 'Démonstration uniquement',
  'The current website presents mock listings and front-end demonstrations. It does not create a tenancy, reserve a property, verify a person or property, or process a payment.': 'Le site actuel présente des annonces fictives et des démonstrations front-end. Il ne crée pas de location, ne réserve pas de bien, ne vérifie aucune personne ou aucun bien et ne traite aucun paiement.',
  'Acceptable use': 'Utilisation acceptable',
  'Do not misuse the site, impersonate another person, submit unlawful material, or interfere with the service.': 'N’utilisez pas le site à mauvais escient, n’usurpez pas l’identité d’une autre personne, ne soumettez pas de contenu illicite et n’interférez pas avec le service.',
  'No reliance on mock listings': 'Ne vous fiez pas aux annonces fictives',
  'Property information is fictional and must not be used for a rental or financial decision.': 'Les informations immobilières sont fictives et ne doivent pas servir à prendre une décision locative ou financière.',
  'Demo access': 'Accès démo',
  'Explore a connected workspace.': 'Découvrez un espace de travail connecté.',
  'This preview uses role-based mock data so you can see how the public experience can lead into tenant, landlord, property-manager, and independent maintenance-operator workflows. No account is created and no credentials are checked.': 'Cet aperçu utilise des données fictives par rôle pour montrer comment l’expérience publique peut mener aux parcours du locataire, du propriétaire, du gestionnaire et de l’opérateur de maintenance indépendant. Aucun compte n’est créé et aucun identifiant n’est vérifié.',
  'Tenant workspace': 'Espace locataire',
  'View a mock viewing request, rent reminder, receipt history, and maintenance update.': 'Consultez une demande de visite, un rappel de loyer, un historique de reçus et une mise à jour de maintenance fictifs.',
  'Enter tenant demo →': 'Entrer dans la démo locataire →',
  'Landlord workspace': 'Espace propriétaire',
  'Review mock occupancy, rent collection, listings, and open maintenance work.': 'Examinez l’occupation, la collecte des loyers, les annonces et les travaux de maintenance ouverts fictifs.',
  'Enter landlord demo →': 'Entrer dans la démo propriétaire →',
  'Manager workspace': 'Espace gestionnaire',
  'See a portfolio-level view of units, tasks, verification, and participant activity.': 'Consultez une vue portefeuille des unités, tâches, vérifications et activités des participants.',
  'Enter manager demo →': 'Entrer dans la démo gestionnaire →',
  'Maintenance operator workspace': 'Espace opérateur de maintenance',
  'Manage assigned work orders, quotes, visits, field reports, and mock earnings.': 'Gérez les ordres de travail assignés, les devis, les visites, les rapports terrain et les revenus fictifs.',
  'Enter operator demo →': 'Entrer dans la démo opérateur →',
  'Independent maintenance operator': 'Opérateur de maintenance indépendant',
  'Production connection point:': 'Point de connexion de production :',
  'Your authentication, roles, session management, and account recovery will replace this demo entry point.': 'Votre authentification, vos rôles, la gestion des sessions et la récupération de compte remplaceront ce point d’entrée de démonstration.',
  'Change demo role': 'Changer de rôle démo',
  'Demo workspace': 'Espace de démonstration',
  'All records below are synthetic. Production authentication and backend services will replace this view.': 'Tous les dossiers ci-dessous sont synthétiques. L’authentification et les services backend de production remplaceront cette vue.',
  'A clearer way to find and manage home.': 'Une manière plus claire de trouver et gérer son logement.',
  'See the thinking behind KEYFORTA: dependable rentals, practical details, and a shared record for the people involved.': 'Découvrez la vision de KEYFORTA : des locations fiables, des détails pratiques et un dossier partagé pour les personnes concernées.',
  'Instrumental soundtrack only · Public preview': 'Bande sonore instrumentale uniquement · Aperçu public',
  'A short KEYFORTA brand film introducing dependable rental discovery, clear costs, and shared records for Kinshasa, with an instrumental soundtrack and no spoken narration.': 'Un court film de marque KEYFORTA présentant la recherche de locations fiables, les coûts clairs et les dossiers partagés à Kinshasa, avec une bande sonore instrumentale et sans narration parlée.',
  'Skip to content': 'Aller au contenu',
  'Open navigation': 'Ouvrir la navigation',
  'Close navigation': 'Fermer la navigation',
  'Primary navigation': 'Navigation principale',
  'Footer explore': 'Pied de page — explorer',
  'Footer company': 'Pied de page — entreprise',
  'Footer legal': 'Pied de page — juridique',
  'KEYFORTA home': 'Accueil KEYFORTA',
  'Tenant': 'Locataire',
  'Landlord': 'Propriétaire',
  'Property manager': 'Gestionnaire immobilier',
  'Your browser does not support video playback.': 'Votre navigateur ne prend pas en charge la lecture vidéo.',
  'Download the video': 'Télécharger la vidéo',
  'English captions': 'Sous-titres français et anglais',
  'Available now': 'Disponible maintenant',
  'Owner information submitted': 'Informations du propriétaire soumises',
  'Property details reviewed': 'Détails du bien examinés',
  '/ month': '/ mois'
};

const localizedProperties = {
  'ngaliema-river': { title: 'Appartement Riverside', available: 'Disponible maintenant', verified: 'Détails du bien examinés', description: 'Un appartement lumineux de deux chambres, avec une disposition pratique, un accès sécurisé et des liaisons faciles vers le centre de Kinshasa.', amenities: ['Résidence sécurisée', 'Réserve d’eau', 'Parking', 'Alimentation de secours prête'] },
  'limete-courtyard': { title: 'Résidence avec cour', available: 'Disponible le 1er octobre', verified: 'Informations du propriétaire soumises', description: 'Un logement soigné de deux chambres organisé autour d’une cour commune calme, adapté à une petite famille ou à un ménage professionnel.', amenities: ['Accès clôturé', 'Cour commune', 'Gardien sur place', 'Transports en commun à proximité'] },
  'kintambo-studio': { title: 'Appartement citadin compact', available: 'Disponible maintenant', verified: 'Détails du bien examinés', description: 'Un appartement compact d’une chambre qui sépare clairement l’espace de vie, la cuisine et l’espace privé.', amenities: ['Entrée privée', 'Stockage d’eau', 'Commerces de proximité', 'Conditions mensuelles simples'] },
  'gombe-view': { title: 'Résidence avec vue urbaine', available: 'Disponible le 1er novembre', verified: 'Détails du bien examinés', description: 'Une résidence urbaine spacieuse avec de beaux espaces de vie et un accès pratique aux bureaux et aux services.', amenities: ['Sécurité 24 h/24', 'Ascenseur', 'Générateur', 'Parking réservé'] },
  'lingwala-family': { title: 'Maison familiale avec cour', available: 'Disponible maintenant', verified: 'Informations du propriétaire soumises', description: 'Une maison familiale pratique avec une cour protégée et l’espace nécessaire pour y vivre durablement.', amenities: ['Cour privée', 'Portail sécurisé', 'Réserve d’eau', 'Animaux acceptés'] },
  'kinshasa-center': { title: 'Appartement central d’une chambre', available: 'Disponible le 15 octobre', verified: 'Détails du bien examinés', description: 'Un logement d’une chambre proche des services quotidiens et des transports publics.', amenities: ['Compteur privé', 'Entrée sécurisée', 'Marché à proximité', 'Visite flexible'] }
};

const originalText = new WeakMap();
const originalAttributes = new WeakMap();
const pageTitlesFr = { home: 'KEYFORTA — Trouver et gérer un logement en confiance', properties: 'Biens — KEYFORTA', how: 'Fonctionnement — KEYFORTA', landlords: 'Propriétaires et gestionnaires — KEYFORTA', trust: 'Confiance et sécurité — KEYFORTA', faq: 'Questions fréquentes — KEYFORTA', contact: 'Contact — KEYFORTA', privacy: 'Avis de confidentialité — KEYFORTA', terms: 'Conditions d’utilisation — KEYFORTA', signin: 'Accès démo — KEYFORTA', demo: 'Espace de travail — KEYFORTA', voice: 'Générateur de voix IA — KEYFORTA' };
const normalize = (value) => value.replace(/\s+/g, ' ').trim();
const translatedPhrase = (value) => lang === 'fr' ? (phraseTranslations[normalize(value)] || normalize(value)) : normalize(value);

function localizedProperty(p) {
  return lang === 'fr' ? { ...p, ...localizedProperties[p.id] } : p;
}

function formatMoney(n) {
  return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

propertyCard = function localizedPropertyCard(p) {
  const item = localizedProperty(p);
  const bedroom = item.beds > 1 ? (lang === 'fr' ? 'chambres' : 'bedrooms') : (lang === 'fr' ? 'chambre' : 'bedroom');
  const bathroom = item.baths > 1 ? (lang === 'fr' ? 'salles de bains' : 'bathrooms') : (lang === 'fr' ? 'salle de bains' : 'bathroom');
  return `<a class="property-card" href="#property/${item.id}"><div class="property-image"><span class="badge">${item.available}</span></div><div class="card-body"><span class="price">${formatMoney(item.price)} <small>${lang === 'fr' ? '/ mois' : '/ month'}</small></span><h3>${item.title}</h3><p class="meta">${item.area}, Kinshasa · ${item.beds} ${bedroom} · ${item.baths} ${bathroom}</p><p class="verification-line"><span class="check-mark">✓</span>${item.verified}</p></div></a>`;
};

detail = function localizedDetail(id) {
  const p = localizedProperty(properties.find((x) => x.id === id) || properties[0]);
  const deposit = p.price * p.depositMonths;
  const bedroom = p.beds > 1 ? (lang === 'fr' ? 'chambres' : 'bedrooms') : (lang === 'fr' ? 'chambre' : 'bedroom');
  const bathroom = p.baths > 1 ? (lang === 'fr' ? 'salles de bains' : 'bathrooms') : (lang === 'fr' ? 'salle de bains' : 'bathroom');
  return `<section class="page shell detail"><div><a href="#properties">← ${lang === 'fr' ? 'Retour aux biens' : 'Back to properties'}</a><div class="detail-photo" role="img" aria-label="${p.title}"></div><div class="content-narrow"><p class="notice"><strong>${lang === 'fr' ? 'Annonce de démonstration :' : 'Demonstration listing:'}</strong> ${lang === 'fr' ? 'Ce bien est une donnée fictive. Il ne peut pas encore être réservé, loué ou payé sur KEYFORTA.' : 'This property is mock data. It cannot be reserved, rented, or paid for through KEYFORTA yet.'}</p><div class="detail-facts"><span><strong>${p.beds}</strong> ${bedroom}</span><span><strong>${p.baths}</strong> ${bathroom}</span><span><strong>${p.area}</strong> ${lang === 'fr' ? 'quartier' : 'neighborhood'}</span><span><strong>${lang === 'fr' ? 'Fictif' : 'Mock'}</strong> ${lang === 'fr' ? 'vérification' : 'verification'}</span></div><h2>${lang === 'fr' ? 'À propos de ce logement' : 'About this home'}</h2><p>${p.description}</p><h2>${lang === 'fr' ? 'Ce qui est inclus' : 'What is included'}</h2><div class="amenities">${p.amenities.map((a) => `<span>${a}</span>`).join('')}</div><div class="detail-sections"><div class="trust-card"><h3>${lang === 'fr' ? 'Aperçu de la vérification' : 'Verification preview'}</h3><p><span class="check-mark">✓</span>${p.verified}</p><p><span class="pending-mark">○</span>${lang === 'fr' ? 'Autorité de propriété : preuve de production en attente' : 'Ownership authority: pending production evidence'}</p><p><span class="pending-mark">○</span>${lang === 'fr' ? 'Identité du participant : vérifiée lors de l’intégration' : 'Participant identity: checked during onboarding'}</p></div><div class="cost-card"><h3>${lang === 'fr' ? 'Coûts indicatifs d’installation' : 'Illustrative move-in costs'}</h3><div><span>${lang === 'fr' ? 'Loyer mensuel' : 'Monthly rent'}</span><strong>${formatMoney(p.price)}</strong></div><div><span>${lang === 'fr' ? `Dépôt indicatif (${p.depositMonths} mois)` : `Example deposit (${p.depositMonths} months)`}</span><strong>${formatMoney(deposit)}</strong></div><div class="total"><span>${lang === 'fr' ? 'Affiché avant tout engagement' : 'Shown before commitment'}</span><strong>${formatMoney(p.price + deposit)}</strong></div><small>${lang === 'fr' ? 'Chiffres fictifs uniquement. Les conditions finales proviendront du contrat connecté.' : 'Mock figures only. Final terms will come from the connected agreement.'}</small></div></div></div></div><aside class="detail-panel"><p class="eyebrow">${p.available}</p><h1>${p.title}</h1><p class="meta">${p.area}, Kinshasa</p><p class="price">${formatMoney(p.price)} <small>${lang === 'fr' ? '/ mois' : '/ month'}</small></p><p>${p.beds} ${bedroom} · ${p.baths} ${bathroom} · 1 ${lang === 'fr' ? 'salon' : 'living room'} · 1 ${lang === 'fr' ? 'cuisine' : 'kitchen'}</p><button class="button" data-open-access data-property-interest="${p.title}" type="button">${lang === 'fr' ? 'Demander une visite' : 'Request a viewing'}</button><a class="button secondary application-link" href="#apply/${p.id}">${lang === 'fr' ? 'Déposer une candidature' : 'Apply to rent this unit'}</a><a class="text-link" href="#trust">${lang === 'fr' ? 'Comment fonctionne la vérification →' : 'How verification works →'}</a></aside></section>`;
};

const englishWorkspace = workspace;
workspace = function localizedWorkspace(role, section = 'dashboard') {
  if (lang === 'en') return englishWorkspace(role, section);
  const data = {
    tenant: { label: 'Espace locataire', title: 'Votre dossier locatif en un coup d’œil.', subtitle: 'Une vue ciblée des visites, paiements, demandes et messages.', stats: [['Prochain loyer', '$400', 'Dû dans 8 jours'], ['Visite', 'Demandée', 'Appartement Riverside'], ['Demande ouverte', '1', 'Inspection de la pompe à eau']], sections: [['Activité à venir', '<div class="activity-row"><span class="activity-icon">↗</span><div><strong>Demande de visite</strong><p>Appartement Riverside · Ngaliema</p></div><span class="status-pill">En attente</span></div><div class="activity-row"><span class="activity-icon">$</span><div><strong>Rappel de loyer</strong><p>Loyer mensuel · Compte fictif</p></div><span class="status-pill teal">Planifié</span></div>'], ['Maintenance et messages', '<div class="activity-row"><span class="activity-icon">!</span><div><strong>Inspection de la pompe à eau</strong><p>Soumise le 8 mai · Réponse du gestionnaire en attente</p></div><span class="status-pill">Ouverte</span></div><div class="activity-row"><span class="activity-icon">•••</span><div><strong>Message du gestionnaire</strong><p>« Nous confirmerons bientôt l’heure de la visite. »</p></div><span class="status-pill teal">Nouveau</span></div>']] },
    landlord: { label: 'Espace propriétaire', title: 'Suivez la santé de vos biens.', subtitle: 'Une vue portefeuille fictive pour les annonces, l’occupation, les paiements et la maintenance.', stats: [['Unités démo', '6', 'Dans Kinshasa'], ['Occupation', '83 %', '5 unités sur 6'], ['Loyers enregistrés', '$1 850', 'Ce mois fictif'], ['Maintenance ouverte', '2', 'À traiter']], sections: [['Activité du portefeuille', '<div class="activity-row"><span class="activity-icon">⌂</span><div><strong>Appartement Riverside</strong><p>Ngaliema · Visite demandée</p></div><span class="status-pill teal">Active</span></div><div class="activity-row"><span class="activity-icon">✓</span><div><strong>Résidence avec cour</strong><p>Limete · Paiement du locataire enregistré</p></div><span class="status-pill teal">Enregistré</span></div>'], ['File des opérations', '<div class="activity-row"><span class="activity-icon">!</span><div><strong>Inspection de la pompe à eau</strong><p>Attribuée au gestionnaire immobilier</p></div><span class="status-pill">Ouverte</span></div><div class="activity-row"><span class="activity-icon">+</span><div><strong>Nouveau brouillon de bien</strong><p>Examinez les détails avant publication</p></div><span class="status-pill">Brouillon</span></div>']] },
    manager: { label: 'Espace gestionnaire immobilier', title: 'Coordonnez le travail derrière chaque logement.', subtitle: 'Une vue opérationnelle fictive des unités, participants, vérifications, paiements et maintenances.', stats: [['Unités gérées', '14', 'Portefeuille démo'], ['Occupation', '93 %', '13 unités sur 14'], ['File de vérification', '3', 'À examiner'], ['Ordres de travail ouverts', '4', 'Sur 3 biens']], sections: [['File prioritaire', '<div class="activity-row"><span class="activity-icon">!</span><div><strong>Examen de vérification</strong><p>2 dossiers de propriétaires et 1 dossier de bien</p></div><span class="status-pill">3 en attente</span></div><div class="activity-row"><span class="activity-icon">↗</span><div><strong>Coordination des visites</strong><p>Deux demandes nécessitent une heure de rendez-vous</p></div><span class="status-pill teal">Aujourd’hui</span></div>'], ['Opérations récentes', '<div class="activity-row"><span class="activity-icon">$</span><div><strong>Dossiers de paiement</strong><p>Cinq reçus fictifs rapprochés</p></div><span class="status-pill teal">Terminé</span></div><div class="activity-row"><span class="activity-icon">•••</span><div><strong>Messages des participants</strong><p>Un nouveau message de locataire nécessite une réponse</p></div><span class="status-pill teal">Nouveau</span></div>']] },
    operator: { label: 'Espace opérateur de maintenance indépendant', title: 'Faites avancer chaque tâche assignée.', subtitle: 'Une vue terrain fictive pour les ordres de travail, devis, visites, preuves et revenus.', stats: [['Tâches assignées', '3', 'Sur 2 biens'], ['Visites aujourd’hui', '2', 'Une arrivée confirmée'], ['Devis à examiner', '1', 'À envoyer avant 17 h'], ['Revenus fictifs', '1 240 $', 'Ce mois de démonstration']], sections: [['Ordres de travail assignés', '<div class="activity-row"><span class="activity-icon">!</span><div><strong>Inspection de la pompe à eau</strong><p>Appartement Riverside · Ngaliema · Priorité élevée</p></div><span class="status-pill">Assignée</span></div><div class="activity-row"><span class="activity-icon">↗</span><div><strong>Entretien du générateur</strong><p>Résidence avec vue urbaine · Gombe · Visite à 14 h</p></div><span class="status-pill teal">Planifiée</span></div><div class="activity-row"><span class="activity-icon">✓</span><div><strong>Réparation de plomberie</strong><p>Maison familiale avec cour · Lingwala · Confirmation du client en attente</p></div><span class="status-pill teal">À examiner</span></div>'], ['Devis et planning', '<div class="activity-row"><span class="activity-icon">$</span><div><strong>Devis de la pompe à eau</strong><p>Estimation des matériaux et de la main-d’œuvre demandée par le gestionnaire</p></div><span class="status-pill">À remettre aujourd’hui</span></div><div class="activity-row"><span class="activity-icon">⌚</span><div><strong>Prochaine plage d’arrivée</strong><p>Aujourd’hui · 14 h–15 h · Client informé</p></div><span class="status-pill teal">Confirmée</span></div>'], ['Rapports terrain et preuves', '<div class="activity-row"><span class="activity-icon">＋</span><div><strong>Rapport d’achèvement</strong><p>Ajoutez les travaux, matériaux, coûts, photos et notes du client</p></div><span class="status-pill">Prêt</span></div><div class="activity-row"><span class="activity-icon">✓</span><div><strong>Dernière tâche terminée</strong><p>Réparation électrique · paiement fictif de 380 $ · reçu disponible</p></div><span class="status-pill teal">Enregistrée</span></div>']] }
  }[role] || null;
  if (!data) return signIn();
  return `<section class="page content-page shell workspace-page"><div class="workspace-top"><div><p class="eyebrow">${data.label} <span class="demo-label">Données fictives</span></p><h1>${data.title}</h1><p class="muted">${data.subtitle}</p></div><a class="button secondary" href="#signin">Changer de rôle démo</a></div><div class="workspace-banner"><strong>Espace de démonstration</strong><span>Tous les dossiers ci-dessous sont synthétiques. L’authentification et les services backend de production remplaceront cette vue. L’accès de l’opérateur est limité à son profil et aux tâches qui lui sont assignées.</span></div>${workspaceModule(role, section)}<div class="workspace-stats">${data.stats.map((x) => `<div class="workspace-stat"><span>${x[0]}</span><strong>${x[1]}</strong><small>${x[2]}</small></div>`).join('')}</div><div class="workspace-grid">${data.sections.map((x) => `<section class="workspace-panel"><h2>${x[0]}</h2>${x[1]}</section>`).join('')}${workspaceActions(role)}</div></section>`;
};

function translatePageContent() {
  document.documentElement.lang = lang;
  const languageToggle = document.querySelector('#language-toggle');
  if (languageToggle) { languageToggle.textContent = lang === 'en' ? 'FR' : 'EN'; languageToggle.setAttribute('aria-label', lang === 'en' ? 'Switch to French' : 'Passer en anglais'); }
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n;
    const source = translations.en[key] || element.textContent;
    element.textContent = lang === 'fr' ? (translations.fr[key] || phraseTranslations[source] || source) : source;
  });
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    if (!node.parentElement || node.parentElement.closest('script,style,[data-i18n]')) return;
    if (!originalText.has(node)) originalText.set(node, node.nodeValue);
    const source = originalText.get(node);
    const leading = source.match(/^\s*/)[0]; const trailing = source.match(/\s*$/)[0];
    const core = source.trim();
    if (!core) return;
    const result = translatedPhrase(core);
    node.nodeValue = `${leading}${result}${trailing}`;
  });
  document.querySelectorAll('[aria-label],[placeholder],[title]').forEach((element) => {
    ['aria-label', 'placeholder', 'title'].forEach((attribute) => {
      if (!element.hasAttribute(attribute)) return;
      const value = element.getAttribute(attribute);
      if (!originalAttributes.has(element)) originalAttributes.set(element, {});
      const sources = originalAttributes.get(element);
      if (!sources[attribute]) sources[attribute] = value;
      const source = sources[attribute];
      element.setAttribute(attribute, translatedPhrase(source));
    });
  });
  const voiceText = document.querySelector('#voice-text');
  if (voiceText) {
    const englishDefault = 'Welcome to KEYFORTA. Discover clearer rental information and manage every property relationship with confidence.';
    const frenchDefault = 'Bienvenue sur KEYFORTA. Découvrez des informations locatives plus claires et gérez chaque relation immobilière en toute confiance.';
    if (voiceText.value === englishDefault || voiceText.value === frenchDefault) voiceText.value = lang === 'fr' ? frenchDefault : englishDefault;
  }
  const [name, id] = (location.hash || '#home').slice(1).split('/');
  if (name === 'property') document.title = `${localizedProperty(properties.find((property) => property.id === id) || properties[0]).title} — KEYFORTA`;
  else document.title = (lang === 'fr' ? pageTitlesFr[name] : pageTitles[name]) || (lang === 'fr' ? pageTitlesFr.home : pageTitles.home);
  const heading = app.querySelector('h1');
  if (heading) app.setAttribute('aria-label', normalize(heading.textContent));
}

translate = translatePageContent;
const languageControl = document.querySelector('#language-toggle');
if (languageControl) {
  const replacement = languageControl.cloneNode(true);
  languageControl.replaceWith(replacement);
  replacement.addEventListener('click', toggleLanguage);
}
translate();
