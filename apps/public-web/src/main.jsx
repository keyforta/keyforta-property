"use client";

import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { keyfortaBrand } from '@keyforta/brand';
import { useEffect } from 'react';
import { HashRouter } from 'react-router-dom';
import './i18n.js';
import App from './App.jsx';

const { colors } = keyfortaBrand;
const keyfortaTheme = {
  ...webLightTheme,
  colorBrandBackground: colors.aubergine,
  colorBrandBackgroundHover: colors.aubergine,
  colorBrandBackgroundPressed: colors.aubergine,
  colorBrandBackgroundSelected: colors.aubergine,
  colorBrandForeground1: colors.aubergine,
  colorBrandForeground2: colors.aubergine,
  colorBrandStroke1: colors.aubergine,
  borderRadiusMedium: '10px',
};

function normalizeLegacyHashRoute() {
  const currentHash = window.location.hash || '';
  if (!currentHash || currentHash === '#') {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/home`);
    return;
  }

  const raw = currentHash.slice(1);
  if (raw.startsWith('/')) return;

  const [pathPart, fragmentPart] = raw.split('#');
  const [routeRoot] = pathPart.split('/');
  const legacyRoots = new Set([
    'home',
    'voice',
    'properties',
    'property',
    'apply',
    'how',
    'landlords',
    'trust',
    'faq',
    'contact',
    'privacy',
    'terms',
    'signin',
    'login',
    'signup',
    'invite',
    'offer-services',
    'demo',
  ]);

  if (routeRoot === 'status') {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/home#status`);
    return;
  }

  if (!legacyRoots.has(routeRoot)) return;

  const normalized = fragmentPart ? `#/${pathPart}#${fragmentPart}` : `#/${pathPart}`;
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${normalized}`);
}

export default function ClientApp() {
  useEffect(() => {
    normalizeLegacyHashRoute();
    window.history.scrollRestoration = 'manual';
  }, []);

  return (
    <FluentProvider theme={keyfortaTheme} className="fluent-app-provider">
      <HashRouter>
        <App />
      </HashRouter>
    </FluentProvider>
  );
}