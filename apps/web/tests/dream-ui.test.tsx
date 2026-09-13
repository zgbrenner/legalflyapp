import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DreamChamber } from '@/components/DreamChamber';
vi.mock('next/dynamic', () => ({ default: () => () => <div>Neural display</div> }));
beforeEach(() => {
  vi.stubGlobal('Worker', class { postMessage() {} terminate() {} });
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('exposes stable reading and experiment labels, independent of selected values', () => {
  render(<DreamChamber />);
  expect(screen.getByLabelText('Reading set', { exact: true }).tagName).toBe('SELECT');
  expect(screen.getByLabelText('After reading', { exact: true }).tagName).toBe('SELECT');
  expect(screen.getByLabelText('Random seed', { exact: true }).tagName).toBe('INPUT');
  expect(screen.getByLabelText('Injected noise', { exact: true }).tagName).toBe('SELECT');
});

it('presents the Legal Dreaming question, scroll cue, and no decorative arrow glyphs', () => {
  render(<DreamChamber />);
  expect(screen.getByRole('heading', { name: 'Can a fruit fly retain legal concepts after the text is gone?' })).toBeTruthy();
  const scrollCue = screen.getByRole('link', { name: 'Scroll to test the experiment' });
  expect(scrollCue.getAttribute('href')).toBe('#dream-lab');
  expect(document.querySelector('.fly-head-hero')).toBeTruthy();
  expect(document.body.textContent || '').not.toContain('↗');
  expect(document.body.textContent || '').not.toContain('↘');
});
