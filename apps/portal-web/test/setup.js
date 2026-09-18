import '@testing-library/jest-dom/vitest';
import { expect } from 'vitest';

window.HTMLCanvasElement.prototype.getContext = () => ({
  fillRect: () => {},
  getImageData: () => ({ data: [] }),
  putImageData: () => {},
  createImageData: () => [],
  setTransform: () => {},
  drawImage: () => {},
  save: () => {},
  fillText: () => {},
  restore: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  closePath: () => {},
  stroke: () => {},
  translate: () => {},
  scale: () => {},
  rotate: () => {},
  arc: () => {},
  fill: () => {},
  measureText: () => ({ width: 0 }),
  transform: () => {},
  rect: () => {},
  clip: () => {},
});

const baseGetComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = (element, pseudoElt) => pseudoElt ? { getPropertyValue: () => '', pseudoElt } : baseGetComputedStyle(element);
