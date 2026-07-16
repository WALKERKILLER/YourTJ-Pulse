import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../src/components/map/map', () => ({
  Map: ({ children }: { children?: ReactNode }) => <div data-testid="pulsetown-map">{children}</div>,
  MapMarker: ({ children }: { children?: ReactNode }) => <div data-testid="map-marker">{children}</div>,
  MarkerContent: ({ children, className }: { children?: ReactNode; className?: string }) => <span className={className}>{children}</span>,
  useMap: vi.fn(),
}));

import { PulseTownPage } from '../src/pages/pulsetown-page';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('PulseTown twin demo', () => {
  it('stays locked until explicit opt-in and labels every position as simulated', () => {
    const { container } = render(<MemoryRouter><PulseTownPage /></MemoryRouter>);
    expect(screen.getByText('数字分身模拟 · 非 GPS 位置')).toBeInTheDocument();
    expect(screen.getByText('等待你的明确授权')).toBeInTheDocument();
    expect(container.querySelector('.twin-low-avatar')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '开启本次数字分身演示' }));
    expect(screen.queryByText('等待你的明确授权')).not.toBeInTheDocument();
    expect(screen.getByText(/MAPLIBRE FALLBACK/)).toBeInTheDocument();
    expect(container.querySelector('.twin-low-avatar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '播放演示' })).toBeEnabled();
  });

  it('advances the local simulation clock only after opt-in and play', () => {
    vi.useFakeTimers();
    const { container } = render(<MemoryRouter><PulseTownPage /></MemoryRouter>);
    const clock = () => container.querySelector('.twin-facts > span:nth-child(2) strong')?.textContent;
    const initial = clock();
    act(() => vi.advanceTimersByTime(1_000));
    expect(clock()).toBe(initial);
    fireEvent.click(screen.getByRole('button', { name: '开启本次数字分身演示' }));
    fireEvent.click(screen.getByRole('button', { name: '播放演示' }));
    act(() => vi.advanceTimersByTime(250));
    expect(clock()).not.toBe(initial);
  });
});
