import './App.styles.css';
import {
  Spinner,
  Toast,
  Toaster,
  ToastTitle,
  useId,
  useToastController,
} from '@fluentui/react-components';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes, matchRoutes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Header, Footer, AccessDialog, BackToTop } from './components/Layout.jsx';
import {
  HomePage,
  PropertiesPage,
  PropertyDetailPage,
  ViewingRequestPage,
  TextContentPage,
} from './views/index.js';
import { buildPortalUrl, resolvePortalWebUrl } from './portal-url.js';
import { appendRow } from './services/storage.js';

const SignInPage = lazy(() => import('./views/AccountPages.jsx').then((module) => ({ default: module.SignInPage })));
const WorkspaceLoginPage = lazy(() => import('./views/AccountPages.jsx').then((module) => ({ default: module.WorkspaceLoginPage })));
const SignupPage = lazy(() => import('./views/AccountPages.jsx').then((module) => ({ default: module.SignupPage })));
const InviteManagerPage = lazy(() => import('./views/AccountPages.jsx').then((module) => ({ default: module.InviteManagerPage })));
const OfferServicesPage = lazy(() => import('./views/AccountPages.jsx').then((module) => ({ default: module.OfferServicesPage })));
const portalWebUrl = resolvePortalWebUrl(
  process.env.NEXT_PUBLIC_PORTAL_WEB_URL,
  process.env.NODE_ENV,
);
const workspaceRoles = ['tenant', 'landlord', 'manager', 'operator'];

const routeMetadata = [
  { path: '/', handle: { name: 'home' } },
  { path: '/home', handle: { name: 'home' } },
  { path: '/voice', handle: { name: 'voice' } },
  { path: '/properties', handle: { name: 'properties' } },
  { path: '/property/:propertyId', handle: { name: 'property' } },
  { path: '/view/:propertyId', handle: { name: 'viewing' } },
  { path: '/how', handle: { name: 'how' } },
  { path: '/landlords', handle: { name: 'landlords' } },
  { path: '/trust', handle: { name: 'trust' } },
  { path: '/faq', handle: { name: 'faq' } },
  { path: '/contact', handle: { name: 'contact' } },
  { path: '/privacy', handle: { name: 'privacy' } },
  { path: '/terms', handle: { name: 'terms' } },
  { path: '/signin', handle: { name: 'signin' } },
  { path: '/login/:role', handle: { name: 'login' } },
  { path: '/signup/:role', handle: { name: 'signup' } },
  { path: '/invite', handle: { name: 'invite' } },
  { path: '/offer-services', handle: { name: 'offer-services' } },
  { path: '/demo/:role/:section?', handle: { name: 'signin' } },
];

function getPageTitle(routeInfo, lang, t) {
  return t(`page_title.${routeInfo.name}`, { defaultValue: t('page_title.home') });
}

function getRouteInfo(pathname) {
  const match = matchRoutes(routeMetadata, pathname)?.at(-1);
  if (!match) return { name: 'home' };
  return {
    ...match.route.handle,
    id: match.route.handle.id || match.params.propertyId || match.params.role,
    section: match.params.section,
  };
}

function PropertyDetailRoute({ lang }) {
  const { propertyId } = useParams();
  return <PropertyDetailPage lang={lang} propertyId={propertyId} />;
}

function ViewingRoute({ lang }) {
  const { propertyId } = useParams();
  return <ViewingRequestPage lang={lang} propertyId={propertyId} />;
}

function LoginRoute({ lang, onSubmit }) {
  const { role } = useParams();
  return <WorkspaceLoginPage lang={lang} role={role} onSubmit={onSubmit} />;
}

function SignupRoute({ lang, onSubmit }) {
  const { role } = useParams();
  return <SignupPage lang={lang} role={role} onSubmit={onSubmit} />;
}

function getPortalUrl(role, email) {
  return buildPortalUrl(portalWebUrl, role, email);
}

function PortalRedirectRoute() {
  const { role } = useParams();
  const target = workspaceRoles.includes(role) ? getPortalUrl(role) : null;

  useEffect(() => {
    if (target) window.location.replace(target);
  }, [target]);

  if (!target) return <Navigate to="/signin" replace />;
  return <div className="page content-page shell route-loading"><Spinner label="Opening KEYFORTA portal" /></div>;
}

export default function App() {
  const { i18n, t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const routeInfo = useMemo(() => getRouteInfo(location.pathname), [location.pathname]);
  const appRef = useRef(null);
  const toasterId = useId('keyforta-toaster');
  const { dispatchToast } = useToastController(toasterId);

  const lang = i18n.resolvedLanguage || 'en';
  const [menuOpen, setMenuOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [accessInterest, setAccessInterest] = useState('');
  const [voiceStatus, setVoiceStatus] = useState('');
  const [voiceText, setVoiceText] = useState(() => t('voice_default_text'));
  const [voiceChoice, setVoiceChoice] = useState('');
  const [voiceVoices, setVoiceVoices] = useState([]);
  const [filters, setFilters] = useState({ area: '', beds: '', max: '', sort: 'recommended' });

  function notify(message, intent = 'success') {
    dispatchToast(
      <Toast><ToastTitle>{message}</ToastTitle></Toast>,
      { intent, timeout: 4000 },
    );
  }

  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem('kf-language', lang);
    document.title = getPageTitle(routeInfo, lang, t);

    let routeScrollTimer;
    const scrollToRouteTarget = (targetId) => {
      routeScrollTimer = window.setTimeout(() => {
        document.getElementById(targetId)?.scrollIntoView({ behavior: 'instant', block: 'start' });
      }, 100);
    };

    if (routeInfo.name === 'voice') {
      scrollToRouteTarget('voice');
    } else if (routeInfo.name === 'home' && location.hash === '#status') {
      scrollToRouteTarget('status');
    } else {
      window.scrollTo(0, 0);
    }

    if (appRef.current) appRef.current.focus({ preventScroll: true });
    return () => window.clearTimeout(routeScrollTimer);
  }, [routeInfo, location.hash, lang, t]);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const populate = () => {
      setVoiceVoices(window.speechSynthesis.getVoices());
    };
    populate();
    window.speechSynthesis.addEventListener('voiceschanged', populate);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', populate);
  }, []);

  useEffect(() => {
    setVoiceText(t('voice_default_text'));
    setVoiceStatus('');
  }, [lang, t]);

  function openAccess(interestValue) {
    if (interestValue === 'landlord') {
      setAccessOpen(false);
      navigate('/signup/landlord');
      return;
    }
    setAccessInterest(interestValue || '');
    setAccessOpen(true);
  }

  function closeAccess() {
    setAccessOpen(false);
  }

  function handleToggleLanguage() {
    const scrollPosition = window.scrollY;
    i18n.changeLanguage(lang === 'en' ? 'fr' : 'en');
    requestAnimationFrame(() => window.scrollTo(0, scrollPosition));
  }

  function handlePropertySearch(values) {
    setFilters((state) => ({ ...state, ...values }));
    navigate('/properties');
  }

  function handleWorkspaceLogin(role, values) {
    const target = getPortalUrl(role, values.email);
    if (!target) {
      notify(t('status.portal_unavailable'), 'error');
      return;
    }
    window.location.assign(target);
  }

  function handleSignup(values) {
    const registration = {
      ...values,
      locale: lang,
      services: values.services.split(',').map((value) => value.trim()).filter(Boolean),
      coverage: values.coverage.split(',').map((value) => value.trim()).filter(Boolean),
    };
    appendRow('kf-registration-requests', registration);
    const message = t('status.registration_received');
    notify(message);
    return message;
  }

  function handleInviteSubmit(values) {
    appendRow('kf-manager-invitations', values);
    const message = t('status.invitation_saved');
    notify(message);
    return message;
  }

  function handleServicesSubmit(values) {
    appendRow('kf-service-offers', values);
    const message = t('status.service_offer_saved');
    notify(message);
    return message;
  }

  function handleContactSubmit(values) {
    appendRow('kf-contact-requests', { ...values, locale: lang });
    const message = t('status.contact_received');
    notify(message);
    return message;
  }

  function handleAccessSubmit(values) {
    if (values.role === 'landlord') {
      setAccessOpen(false);
      navigate('/signup/landlord');
      return '';
    }
    const reference = `KF-${Date.now().toString(36).toUpperCase()}`;
    appendRow('kf-access-requests', { ...values, locale: lang, reference });
    setAccessInterest(values.interest || '');
    const message = t('status.access_request_saved', { reference });
    notify(message);
    return message;
  }

  function handleVoicePlay(event) {
    event.preventDefault();
    if (!('speechSynthesis' in window)) {
      setVoiceStatus(t('voice_status_unavailable'));
      return;
    }
    if (!voiceText.trim()) return;
    const utterance = new SpeechSynthesisUtterance(voiceText.trim());
    utterance.lang = lang === 'fr' ? 'fr-FR' : 'en-US';
    const selectedVoice = voiceVoices[Number(voiceChoice)];
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setVoiceStatus(t('voice_status_playing'));
  }

  function handleVoiceStop() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setVoiceStatus(t('voice_status_stopped'));
  }

  return (
    <>
      <a
        className="skip-link"
        href="#app"
        onClick={(event) => {
          event.preventDefault();
          appRef.current?.focus();
        }}
      >
        {t('a11y.skip_to_content')}
      </a>
      <Header
        lang={lang}
        menuOpen={menuOpen}
        onToggleLanguage={handleToggleLanguage}
        onOpenAccess={openAccess}
        onToggleMenu={() => setMenuOpen((value) => !value)}
        onCloseMenu={() => setMenuOpen(false)}
      />
      <main id="app" ref={appRef} tabIndex={-1} aria-label={t('a11y.page_content')}>
        <Suspense fallback={<div className="page content-page shell route-loading"><Spinner label={t('common.loading')} /></div>}>
          <Routes>
            <Route path="/" element={<HomePage lang={lang} onSearch={handlePropertySearch} voiceText={voiceText} voiceStatus={voiceStatus} voiceVoices={voiceVoices} voiceChoice={voiceChoice} onVoiceChoice={setVoiceChoice} onVoiceText={setVoiceText} onVoicePlay={handleVoicePlay} onVoiceStop={handleVoiceStop} onOpenAccess={openAccess} />} />
            <Route path="/home" element={<HomePage lang={lang} onSearch={handlePropertySearch} voiceText={voiceText} voiceStatus={voiceStatus} voiceVoices={voiceVoices} voiceChoice={voiceChoice} onVoiceChoice={setVoiceChoice} onVoiceText={setVoiceText} onVoicePlay={handleVoicePlay} onVoiceStop={handleVoiceStop} onOpenAccess={openAccess} />} />
            <Route path="/voice" element={<HomePage lang={lang} voiceRoute voiceText={voiceText} voiceStatus={voiceStatus} voiceVoices={voiceVoices} voiceChoice={voiceChoice} onVoiceChoice={setVoiceChoice} onVoiceText={setVoiceText} onVoicePlay={handleVoicePlay} onVoiceStop={handleVoiceStop} onOpenAccess={openAccess} />} />
            <Route path="/properties" element={<PropertiesPage lang={lang} filters={filters} onFilterChange={(name, value) => setFilters((state) => (name === 'reset' ? { area: '', beds: '', max: '', sort: 'recommended' } : { ...state, [name]: value }))} />} />
            <Route path="/property/:propertyId" element={<PropertyDetailRoute lang={lang} />} />
            <Route path="/view/:propertyId" element={<ViewingRoute lang={lang} />} />
            <Route path="/how" element={<TextContentPage lang={lang} kind="how" />} />
            <Route path="/landlords" element={<TextContentPage lang={lang} kind="landlords" />} />
            <Route path="/trust" element={<TextContentPage lang={lang} kind="trust" />} />
            <Route path="/faq" element={<TextContentPage lang={lang} kind="faq" />} />
            <Route path="/contact" element={<TextContentPage lang={lang} kind="contact" onContactSubmit={handleContactSubmit} />} />
            <Route path="/privacy" element={<TextContentPage lang={lang} kind="privacy" />} />
            <Route path="/terms" element={<TextContentPage lang={lang} kind="terms" />} />
            <Route path="/signin" element={<SignInPage lang={lang} />} />
            <Route path="/login/:role" element={<LoginRoute lang={lang} onSubmit={handleWorkspaceLogin} />} />
            <Route path="/signup/:role" element={<SignupRoute lang={lang} onSubmit={handleSignup} />} />
            <Route path="/invite" element={<InviteManagerPage lang={lang} onSubmit={handleInviteSubmit} />} />
            <Route path="/offer-services" element={<OfferServicesPage lang={lang} onSubmit={handleServicesSubmit} />} />
            <Route path="/demo/:role" element={<PortalRedirectRoute />} />
            <Route path="/demo/:role/:section" element={<PortalRedirectRoute />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </Suspense>
      </main>
      <Footer lang={lang} />
      <BackToTop />
      <AccessDialog lang={lang} open={accessOpen} interest={accessInterest} onClose={closeAccess} onSubmit={handleAccessSubmit} />
      <Toaster toasterId={toasterId} position="top-end" pauseOnHover />
    </>
  );
}
