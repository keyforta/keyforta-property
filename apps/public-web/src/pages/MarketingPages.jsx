import './MarketingPages.styles.css';
import { Button, Field, Select, Textarea } from '@fluentui/react-components';
import { Circle12Filled } from '@fluentui/react-icons';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { properties } from '../data/content.js';
import { PropertyCard } from '../components/PropertyCard.jsx';
import { StatusMessage } from '../components/StatusMessage.jsx';

export function HomePage({
  lang,
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
  const audienceItems = t('marketing.audience.items', { returnObjects: true, defaultValue: [] });

  return (
    <div className={`page${voiceRoute ? ' voice-page' : ''}`}>
      <section className="shell hero">
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
        <div className="hero-media" role="img" aria-label={t('marketing.hero_media_alt')}>
          <img src="/keyforta-logo-reversed.png" alt="" aria-hidden="true" />
        </div>
      </section>

      <section className="shell demo-banner">
        <Circle12Filled className="status-dot" aria-hidden="true" />
        <strong>{t('marketing.public_preview')}</strong>
        <span>{t('marketing.public_preview_desc')}</span>
        <Link to="/home#status">{t('marketing.included_link')}</Link>
      </section>

      <section className="shell stats">
        <div className="stat">
          <strong>{t('marketing.stats.listings.0')}</strong>
          <span>{t('marketing.stats.listings.1')}</span>
        </div>
        <div className="stat">
          <strong>{t('marketing.stats.costs.0')}</strong>
          <span>{t('marketing.stats.costs.1')}</span>
        </div>
        <div className="stat">
          <strong>{t('marketing.stats.everyone.0')}</strong>
          <span>{t('marketing.stats.everyone.1')}</span>
        </div>
        <div className="stat">
          <strong>{t('marketing.stats.kinshasa.0')}</strong>
          <span>{t('marketing.stats.kinshasa.1')}</span>
        </div>
      </section>

      <section className="section white">
        <div className="shell">
          <div className="section-head">
            <div>
              <p className="eyebrow">{t('marketing.featured.eyebrow')}</p>
              <h2>{t('marketing.featured.title')}</h2>
            </div>
            <p>{t('marketing.featured.intro')}</p>
          </div>
          <div className="cards">{properties.slice(0, 3).map((item, index) => <PropertyCard key={item.id} lang={lang} item={item} position={index} />)}</div>
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
            <article className="feature"><h3>{t('marketing.standard.compare.0')}</h3><p>{t('marketing.standard.compare.1')}</p></article>
            <article className="feature"><h3>{t('marketing.standard.verify.0')}</h3><p>{t('marketing.standard.verify.1')}</p></article>
            <article className="feature"><h3>{t('marketing.standard.track.0')}</h3><p>{t('marketing.standard.track.1')}</p></article>
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
              <source src="keyforta-marketing-video.mp4" type="video/mp4" />
              <track kind="captions" srcLang="en" label={t('marketing.video.captions')} src="keyforta-marketing-video.vtt" default />
            </video>
            <p id="video-description" className="sr-only">
              {t('marketing.video.description')}
            </p>
          </div>
        </div>
      </section>

      <section className="section white" id="status">
        <div className="shell">
          <div className="section-head">
            <div>
              <p className="eyebrow">{t('marketing.preview.eyebrow')}</p>
              <h2>{t('marketing.preview.title')}</h2>
            </div>
            <p>{t('marketing.preview.intro')}</p>
          </div>
          <div className="status-grid">
            <article className="status-panel">
              <h3>{t('marketing.preview.available_title')}</h3>
              <ul>
                {t('marketing.preview.available_items', { returnObjects: true, defaultValue: [] }).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
            <article className="status-panel next">
              <h3>{t('marketing.preview.production_title')}</h3>
              <ul>
                {t('marketing.preview.production_items', { returnObjects: true, defaultValue: [] }).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
          </div>
          <div className="launch-cta">
            <div>
              <p className="eyebrow">{t('marketing.preview.cta_eyebrow')}</p>
              <h3>{t('marketing.preview.cta_title')}</h3>
            </div>
            <Button className="button copper" onClick={() => onOpenAccess('')}>
              {t('marketing.preview.cta_action')}
            </Button>
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
