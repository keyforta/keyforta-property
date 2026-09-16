"use client";

import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { keyfortaBrand } from '@keyforta/brand';
import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import './i18n.js';
import App from './App.jsx';
import { getLegacyRouteUrl } from './route-normalization.js';

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
  const normalized = getLegacyRouteUrl(window.location);
  if (normalized) window.history.replaceState(null, '', normalized);
}

if (typeof window !== 'undefined') normalizeLegacyHashRoute();

export default function ClientApp() {
  useEffect(() => {
    window.history.scrollRestoration = 'manual';
  }, []);

  return (
    <FluentProvider theme={keyfortaTheme} className="fluent-app-provider">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </FluentProvider>
  );
}