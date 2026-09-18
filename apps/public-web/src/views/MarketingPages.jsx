import './MarketingPages.styles.css';
import { Button, Field, Select, Textarea } from '@fluentui/react-components';
import {
  ArrowRight20Regular,
  BuildingHome20Regular,
  Circle12Filled,
  HomeMoney20Regular,
  Location20Regular,
  PeopleCommunity20Regular,
} from '@fluentui/react-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ListingError, ListingLoading } from '../components/ListingRequestState.jsx';
import { PropertyCard } from '../components/PropertyCard.jsx';
import { StatusMessage } from '../components/StatusMessage.jsx';
import { usePublicProperties } from '../hooks/use-public-properties.js';

const marketingHeroImageUrl = '/assets/properties/ngaliema-river.jpg';

function HeroTypewriter({ label, messages }) {
  const [reduceMotion, setReduceMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [messageIndex, setMessageIndex] = useState(0);
  const [characterCount, setCharacterCount] = useState(() => (reduceMotion ? messages[0].title.length : 0));
  const [isDeleting, setIsDeleting] = useState(false);
  const messageSignature = messages.map(({ title }) => title).join('\0');
  const message = messages[messageIndex];
  const Icon = message.icon;

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReduceMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);
    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    setMessageIndex(0);
    setCharacterCount(reduceMotion ? messages[0].title.length : 0);
    setIsDeleting(false);
  }, [messageSignature, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) return undefined;

    let delay = isDeleting ? 58 : 105;
    if (!isDeleting && characterCount === message.title.length) delay = 4000;
    if (isDeleting && characterCount === 0) delay = 450;

    const timer = window.setTimeout(() => {
      if (!isDeleting && characterCount === message.title.length) {
        setIsDeleting(true);
      } else if (isDeleting && characterCount === 0) {
        setMessageIndex((current) => (current + 1) % messages.length);
        setIsDeleting(false);
      } else {
        setCharacterCount((current) => current + (isDeleting ? -1 : 1));
      }
    }, delay);

    return () => window.clearTimeout(timer);
  }, [characterCount, isDeleting, message.title, messages.length, reduceMotion]);

  return (
    <aside className="hero-typewriter" aria-labelledby="hero-typewriter-title">
      <h2 className="sr-only" id="hero-typewriter-title">{label}</h2>
      <ul className="sr-only">
        {messages.map(({ detail, key, title }) => <li key={key}>{title}: {detail}</li>)}
      </ul>
      <div className="hero-typewriter-content" aria-hidden="true">
        <div className="hero-typewriter-kicker">
          <span className="hero-typewriter-label"><Icon aria-hidden="true" />{label}</span>
          <span>{String(messageIndex + 1).padStart(2, '0')} / {String(messages.length).padStart(2, '0')}</span>
        </div>
        <strong className="hero-typewriter-line" aria-hidden="true">
          {message.title.slice(0, characterCount)}
          <span className="hero-typewriter-cursor" />
        </strong>
        <p>{message.detail}</p>
        <div className="hero-typewriter-progress" aria-hidden="true">
          {messages.map(({ key }, index) => <span className={index === messageIndex ? 'active' : ''} key={key} />)}
        </div>
      </div>
    </aside>
  );
}

export function HomePage({
  lang,
  onSearch,
  voiceRoute = false,
  voiceText,
  voiceStatus,
  voiceVoices,
  voiceChoice,
  onVoiceChoice,
  onVoiceText,
  onVoicePlay,
  onVoiceStop,
  onOpenAccess,
}) {
  const { t } = useTranslation();
  const { data: propertyResult, error: propertyError, loading: propertiesLoading, retry: retryProperties } = usePublicProperties({ limit: '3' });
  const properties = propertyResult?.items || [];
  const audienceItems = t('marketing.audience.items', { returnObjects: true, defaultValue: [] });
  const audienceRoutes = ['/properties', '/signup/landlord', '/signin', '/signup/operator'];
  const collectionProofs = [
    [String(propertyResult?.total || 0).padStart(2, '0'), t('marketing.proof.homes')],
    [t('marketing.proof.terms_value'), t('marketing.proof.terms')],
    [t('marketing.proof.viewings_value'), t('marketing.proof.viewings')],
  ];
  const heroMessages = [
    ['kinshasa', Location20Regular],
    ['listings', BuildingHome20Regular],
    ['costs', HomeMoney20Regular],
    ['everyone', PeopleCommunity20Regular],
  ].map(([key, icon]) => ({
    key,
    icon,
    title: t(`marketing.stats.${key}.0`),
    detail: t(`marketing.stats.${key}.1`),
  }));

  return (
    <div className={`page${voiceRoute ? ' voice-page' : ''}`}>
      <section
        className="shell hero"
        style={{ backgroundImage: `linear-gradient(90deg, rgba(31, 17, 36, .92) 0%, rgba(31, 17, 36, .68) 48%, rgba(31, 17, 36, .2) 100%), url("${marketingHeroImageUrl}")` }}
      >
        <div className="hero-copy">
          <p className="eyebrow">{t('marketing.eyebrow')}</p>
          <h1>
            {t('marketing.title_line_1')}
            <br />
            {t('marketing.title_line_2')}
          </h1>
          <p>{t('marketing.intro')}</p>
          <div className="hero-actions">
            <Link className="button copper" to="/properties">
              {t('marketing.browse_properties')}
            </Link>
            <Button className="button secondary" onClick={() => onOpenAccess('')}>
              {t('request_access')}
            </Button>
          </div>
        </div>
        <div className="hero-media">
          <HeroTypewriter label={t('marketing.stats.label')} messages={heroMessages} />
        </div>
      </section>

      <section className="inventory-proof" aria-labelledby="inventory-proof-title">
        <div className="shell inventory-proof-layout">
          <div className="inventory-proof-intro">
            <p className="eyebrow">{t('marketing.proof.eyebrow')}</p>
            <h2 id="inventory-proof-title">{t('marketing.proof.title')}</h2>
            <p>{t('marketing.proof.intro')}</p>
          </div>
          <div className="inventory-proof-facts">
            {collectionProofs.map(([value, label], index) => (
              <div className="inventory-proof-fact" key={label}>
                <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <strong>{value}</strong>
                <p>{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <form
        className="shell property-search-dock"
        aria-label={t('marketing.search.label')}
        onSubmit={(event) => {
          event.preventDefault();
          onSearch(Object.fromEntries(new FormData(event.currentTarget)));
        }}
      >
        <Field label={t('marketing.search.area')}>
          <Select name="area" defaultValue="">
            <option value="">{t('marketing.search.any_area')}</option>
            {[...new Set(properties.map((item) => item.district))].map((district) => <option key={district} value={district}>{district}</option>)}
          </Select>
        </Field>
        <Field label={t('marketing.search.bedrooms')}>
          <Select name="beds" defaultValue="">
            <option value="">{t('marketing.search.any')}</option>
            <option value="1">1+</option>
            <option value="2">2+</option>
            <option value="3">3+</option>
          </Select>
        </Field>
        <Field label={t('marketing.search.max_rent')}>
          <Select name="max" defaultValue="">
            <option value="">{t('marketing.search.any')}</option>
            <option value="300">$300</option>
            <option value="500">$500</option>
            <option value="900">$900</option>
          </Select>
        </Field>
        <Button className="button copper" type="submit">{t('marketing.search.action')}</Button>
      </form>

      <section className="section white featured-section">
        <div className="shell">
          <div className="section-head">
            <div>
              <p className="eyebrow">{t('marketing.featured.eyebrow')}</p>
              <h2>{t('marketing.featured.title')}</h2>
            </div>
            <p>{t('marketing.featured.intro')}</p>
          </div>
          <div className="cards">
            {propertiesLoading ? <ListingLoading /> : propertyError ? <ListingError onRetry={retryProperties} /> : properties.length
              ? properties.slice(0, 3).map((item, index) => <PropertyCard key={item.id} lang={lang} item={item} position={index} />)
              : <div className="empty">{t('property_pages.empty')}</div>}
          </div>
          <div className="card-actions">
            <Link className="button secondary" to="/properties">
              {t('marketing.featured.view_all')}
            </Link>
          </div>
        </div>
      </section>

      <section className="section audience-section">
        <div className="shell">
          <div className="section-head">
            <div>
              <p className="eyebrow">{t('marketing.audience.eyebrow')}</p>
              <h2>{t('marketing.audience.title')}</h2>
            </div>
            <p>{t('marketing.audience.intro')}</p>
          </div>
          <div className="feature-grid">
            {audienceItems.map((item, index) => (
              <article className="feature" key={String(index)}>
                <span className="number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <h3>{item[0]}</h3>
                <p>{item[1]}</p>
                <Link className="feature-action" to={audienceRoutes[index]}>
                  {item[2]} <ArrowRight20Regular aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section process-section">
        <div className="shell">
          <div className="section-head">
            <div>
              <p className="eyebrow">{t('marketing.standard.eyebrow')}</p>
              <h2>{t('marketing.standard.title')}</h2>
            </div>
            <p>{t('marketing.standard.intro')}</p>
          </div>
          <div className="feature-grid">
            {['compare', 'verify', 'track'].map((step, index) => (
              <article className="feature" key={step}>
                <span className="number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <h3>{t(`marketing.standard.${step}.0`)}</h3>
                <p>{t(`marketing.standard.${step}.1`)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section video-section" aria-labelledby="video-title">
        <div className="shell video-layout">
          <div className="video-copy">
            <p className="eyebrow">{t('marketing.video.eyebrow')}</p>
            <h2 id="video-title">{t('marketing.video.title')}</h2>
            <p>{t('marketing.video.intro')}</p>
            <p className="video-note">
              <Circle12Filled className="status-dot" aria-hidden="true" /> {t('marketing.video.note')}
            </p>
          </div>
          <div className="video-frame">
            <video controls playsInline preload="metadata" aria-describedby="video-description">
              <source src="/assets/marketing/keyforta-marketing-video.mp4" type="video/mp4" />
              <track kind="captions" srcLang="en" label={t('marketing.video.captions')} src="/assets/marketing/keyforta-marketing-video.vtt" default />
            </video>
            <p id="video-description" className="sr-only">
              {t('marketing.video.description')}
            </p>
          </div>
        </div>
      </section>

      <section className={`section voice-section${voiceRoute ? ' voice-route' : ''}`} id="voice" aria-labelledby="voice-title">
        <div className="shell voice-layout">
          <div className="voice-copy">
            <p className="eyebrow">{t('voice_eyebrow')}</p>
            <h2 id="voice-title">{t('voice_title')}</h2>
            <p>{t('voice_intro')}</p>
          </div>
          <div className="voice-card">
            <form className="form-grid" onSubmit={onVoicePlay}>
              <Field label={t('voice_label')}>
                <Textarea id="voice-text" value={voiceText} onChange={(_, data) => onVoiceText(data.value)} required />
              </Field>
              <Field label={t('voice_voice')}>
                <Select id="voice-choice" value={voiceChoice} onChange={(_, data) => onVoiceChoice(data.value)}>
                  <option value="">{t('voice_default')}</option>
                  {voiceVoices.map((voice, index) => (
                    <option key={`${voice.name}-${index}`} value={String(index)}>
                      {voice.name} ({voice.lang})
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="voice-actions">
                <Button className="button copper" type="submit">{t('voice_play')}</Button>
                <Button className="button secondary" type="button" onClick={onVoiceStop}>{t('voice_stop')}</Button>
              </div>
              <StatusMessage className="form-status show" intent="info" message={voiceStatus || t('voice_status_ready')} />
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
