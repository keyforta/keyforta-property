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
import { Header, Footer, AccessDialog } from './components/Layout.jsx';
import {
  HomePage,
  PropertiesPage,
  PropertyDetailPage,
  RentalApplicationPage,
  TextContentPage,
} from './pages/index.js';
import { localizeProperty, properties } from './data/content.js';
import { appendRow, getRows, setValue } from './services/storage.js';
import { runCrud } from './services/mockApiService.js';

const SignInPage = lazy(() => import('./pages/AccountPages.jsx').then((module) => ({ default: module.SignInPage })));
const WorkspaceLoginPage = lazy(() => import('./pages/AccountPages.jsx').then((module) => ({ default: module.WorkspaceLoginPage })));
const SignupPage = lazy(() => import('./pages/AccountPages.jsx').then((module) => ({ default: module.SignupPage })));
const InviteManagerPage = lazy(() => import('./pages/AccountPages.jsx').then((module) => ({ default: module.InviteManagerPage })));
const OfferServicesPage = lazy(() => import('./pages/AccountPages.jsx').then((module) => ({ default: module.OfferServicesPage })));
const DemoApiPage = lazy(() => import('./pages/WorkspacePages.jsx').then((module) => ({ default: module.DemoApiPage })));
const WorkspacePage = lazy(() => import('./pages/WorkspacePages.jsx').then((module) => ({ default: module.WorkspacePage })));

const routeMetadata = [
  { path: '/', handle: { name: 'home' } },
  { path: '/home', handle: { name: 'home' } },
  { path: '/voice', handle: { name: 'voice' } },
  { path: '/properties', handle: { name: 'properties' } },
  { path: '/property/:propertyId', handle: { name: 'property' } },
  { path: '/apply/:propertyId', handle: { name: 'apply' } },
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
  { path: '/demo/api', handle: { name: 'demo', id: 'api' } },
  { path: '/demo/:role/:section?', handle: { name: 'demo' } },
];

function getPageTitle(routeInfo, lang, t) {
  if (routeInfo.name === 'property') {
    const item = localizeProperty(properties.find((row) => row.id === routeInfo.id) || properties[0], lang);
    return `${item.title} - KEYFORTA`;
  }
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

function isWorkspaceRoute(routeInfo) {
  return routeInfo.name === 'demo' && routeInfo.id !== 'api' && ['tenant', 'landlord', 'manager', 'operator'].includes(routeInfo.id);
}

function PropertyDetailRoute({ lang, onOpenAccess }) {
  const { propertyId } = useParams();
  return <PropertyDetailPage lang={lang} propertyId={propertyId} onOpenAccess={onOpenAccess} />;
}

function ApplyRoute({ lang, onSubmit }) {
  const { propertyId } = useParams();
  return <RentalApplicationPage lang={lang} propertyId={propertyId} onSubmit={onSubmit} />;
}

function LoginRoute({ lang, onSubmit }) {
  const { role } = useParams();
  return <WorkspaceLoginPage lang={lang} role={role} onSubmit={onSubmit} />;
}

function SignupRoute({ lang, onSubmit }) {
  const { role } = useParams();
  return <SignupPage lang={lang} role={role} onSubmit={onSubmit} />;
}

function WorkspaceRoute({ lang, managerApplications, onAction }) {
  const { role, section } = useParams();
  return (
    <WorkspacePage
      lang={lang}
      role={role}
      section={section || 'dashboard'}
      managerApplications={managerApplications}
      onAction={(action) => onAction(action, role)}
    />
  );
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
  const [apiStatuses, setApiStatuses] = useState({});

  const workspaceRole = isWorkspaceRoute(routeInfo) ? routeInfo.id : null;
  const workspaceSection = routeInfo.section || 'dashboard';

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

  const managerApplications = useMemo(() => getRows('kf-rental-applications'), [location.pathname]);

  function openAccess(interestValue) {
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

  function handleWorkspaceLogin(role, values) {
    setValue('kf-demo-session', { role, email: values.email, createdAt: new Date().toISOString() });
    navigate(`/demo/${role}`);
  }

  function handleSignup(values) {
    appendRow('kf-signups', values);
    const role = values.role === 'maintenance_operator' ? 'operator' : 'landlord';
    navigate(`/login/${role}`);
  }

  function handleRentalApplication(values) {
    appendRow('kf-rental-applications', { ...values, status: 'submitted_for_manager_review' });
    const message = t('status.application_submitted');
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

  function handleDemoFormSubmit(values) {
    appendRow('kf-demo-submissions', values);
    const message = t('status.saved_demo');
    notify(message);
    return message;
  }

  function handleAccessSubmit(values) {
    const reference = `KF-${Date.now().toString(36).toUpperCase()}`;
    appendRow('kf-access-requests', { ...values, reference });
    setAccessInterest(values.interest || '');
    const message = t('status.access_request_saved', { reference });
    notify(message);
    return message;
  }

  function handleCrud(resource, operation) {
    try {
      const result = runCrud(resource, operation);
      const serialized = JSON.stringify(result);
      const operationKey = operation === 'delete' ? 'remove' : operation;
      const operationLabel = t(`api.${operationKey}`);
      const resourceLabel = t(`api.resource_labels.${resource}`, { defaultValue: resource });
      const payload = `${serialized.slice(0, 180)}${serialized.length > 180 ? '...' : ''}`;
      const text = t('status.api_result', { operation: operationLabel, resource: resourceLabel, payload });
      setApiStatuses((state) => ({ ...state, [resource]: text }));
      notify(text);
    } catch (error) {
      const operationKey = operation === 'delete' ? 'remove' : operation;
      const operationLabel = t(`api.${operationKey}`);
      const resourceLabel = t(`api.resource_labels.${resource}`, { defaultValue: resource });
      const text = t('status.api_error', { operation: operationLabel, resource: resourceLabel, message: error.message });
      setApiStatuses((state) => ({ ...state, [resource]: text }));
      notify(text, 'error');
    }
  }

  function handleWorkspaceAction(action, role = 'unknown') {
    appendRow('kf-workflow-events', { action, role, source: 'mock-ui' });
    notify(t('status.workspace_action_saved'));
    if (action === 'invite-manager') navigate('/invite');
    if (action === 'offer-services') navigate('/offer-services');
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
        workspaceRole={workspaceRole}
        workspaceSection={workspaceSection}
        menuOpen={menuOpen}
        onToggleLanguage={handleToggleLanguage}
        onOpenAccess={openAccess}
        onToggleMenu={() => setMenuOpen((value) => !value)}
        onCloseMenu={() => setMenuOpen(false)}
        onSignOut={() => {
          localStorage.removeItem('kf-demo-session');
          navigate('/signin');
        }}
      />
      <main id="app" ref={appRef} tabIndex={-1} aria-label={t('a11y.page_content')}>
        <Suspense fallback={<div className="page content-page shell route-loading"><Spinner label={t('common.loading')} /></div>}>
          <Routes>
            <Route path="/" element={<HomePage lang={lang} voiceText={voiceText} voiceStatus={voiceStatus} voiceVoices={voiceVoices} voiceChoice={voiceChoice} onVoiceChoice={setVoiceChoice} onVoiceText={setVoiceText} onVoicePlay={handleVoicePlay} onVoiceStop={handleVoiceStop} onOpenAccess={openAccess} />} />
            <Route path="/home" element={<HomePage lang={lang} voiceText={voiceText} voiceStatus={voiceStatus} voiceVoices={voiceVoices} voiceChoice={voiceChoice} onVoiceChoice={setVoiceChoice} onVoiceText={setVoiceText} onVoicePlay={handleVoicePlay} onVoiceStop={handleVoiceStop} onOpenAccess={openAccess} />} />
            <Route path="/voice" element={<HomePage lang={lang} voiceRoute voiceText={voiceText} voiceStatus={voiceStatus} voiceVoices={voiceVoices} voiceChoice={voiceChoice} onVoiceChoice={setVoiceChoice} onVoiceText={setVoiceText} onVoicePlay={handleVoicePlay} onVoiceStop={handleVoiceStop} onOpenAccess={openAccess} />} />
            <Route path="/properties" element={<PropertiesPage lang={lang} filters={filters} onFilterChange={(name, value) => setFilters((state) => (name === 'reset' ? { area: '', beds: '', max: '', sort: 'recommended' } : { ...state, [name]: value }))} />} />
            <Route path="/property/:propertyId" element={<PropertyDetailRoute lang={lang} onOpenAccess={openAccess} />} />
            <Route path="/apply/:propertyId" element={<ApplyRoute lang={lang} onSubmit={handleRentalApplication} />} />
            <Route path="/how" element={<TextContentPage lang={lang} kind="how" onDemoFormSubmit={handleDemoFormSubmit} />} />
            <Route path="/landlords" element={<TextContentPage lang={lang} kind="landlords" onDemoFormSubmit={handleDemoFormSubmit} />} />
            <Route path="/trust" element={<TextContentPage lang={lang} kind="trust" onDemoFormSubmit={handleDemoFormSubmit} />} />
            <Route path="/faq" element={<TextContentPage lang={lang} kind="faq" onDemoFormSubmit={handleDemoFormSubmit} />} />
            <Route path="/contact" element={<TextContentPage lang={lang} kind="contact" onDemoFormSubmit={handleDemoFormSubmit} />} />
            <Route path="/privacy" element={<TextContentPage lang={lang} kind="privacy" onDemoFormSubmit={handleDemoFormSubmit} />} />
            <Route path="/terms" element={<TextContentPage lang={lang} kind="terms" onDemoFormSubmit={handleDemoFormSubmit} />} />
            <Route path="/signin" element={<SignInPage lang={lang} />} />
            <Route path="/login/:role" element={<LoginRoute lang={lang} onSubmit={handleWorkspaceLogin} />} />
            <Route path="/signup/:role" element={<SignupRoute lang={lang} onSubmit={handleSignup} />} />
            <Route path="/invite" element={<InviteManagerPage lang={lang} onSubmit={handleInviteSubmit} />} />
            <Route path="/offer-services" element={<OfferServicesPage lang={lang} onSubmit={handleServicesSubmit} />} />
            <Route path="/demo/api" element={<DemoApiPage lang={lang} statuses={apiStatuses} onCrud={handleCrud} />} />
            <Route path="/demo/:role" element={<WorkspaceRoute lang={lang} managerApplications={managerApplications} onAction={handleWorkspaceAction} />} />
            <Route path="/demo/:role/:section" element={<WorkspaceRoute lang={lang} managerApplications={managerApplications} onAction={handleWorkspaceAction} />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </Suspense>
      </main>
      {!workspaceRole && <Footer lang={lang} />}
      <AccessDialog lang={lang} open={accessOpen} interest={accessInterest} onClose={closeAccess} onSubmit={handleAccessSubmit} />
      <Toaster toasterId={toasterId} position="top-end" pauseOnHover />
    </>
  );
}
