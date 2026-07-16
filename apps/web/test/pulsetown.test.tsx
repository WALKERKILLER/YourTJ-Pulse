import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { PulseTownPage } from '../src/pages/pulsetown-page';

describe('PulseTown twin demo', () => {
  it('stays locked until explicit opt-in and labels every position as simulated', () => {
    const { container } = render(<MemoryRouter><PulseTownPage /></MemoryRouter>);
    expect(screen.getByText('数字分身模拟 · 非 GPS 位置')).toBeInTheDocument();
    expect(screen.getByText('等待你的明确授权')).toBeInTheDocument();
    expect(container.querySelector('.twin-avatar')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '开启本次数字分身演示' }));
    expect(screen.queryByText('等待你的明确授权')).not.toBeInTheDocument();
    expect(container.querySelector('.twin-avatar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '播放演示' })).toBeEnabled();
  });
});
