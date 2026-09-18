import React from 'react';
import { vi } from 'vitest';

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

if (!window.scrollTo) window.scrollTo = () => {};
if (!window.HTMLElement.prototype.scrollIntoView) window.HTMLElement.prototype.scrollIntoView = () => {};
if (!window.requestAnimationFrame) window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
if (!window.cancelAnimationFrame) window.cancelAnimationFrame = (id) => clearTimeout(id);
if (!window.speechSynthesis) {
  window.speechSynthesis = {
    cancel: vi.fn(),
    speak: vi.fn(),
    getVoices: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}
if (!globalThis.SpeechSynthesisUtterance) {
  globalThis.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text = '') {
    this.text = text;
    this.lang = '';
    this.voice = null;
  };
}
if (!globalThis.React) globalThis.React = React;
