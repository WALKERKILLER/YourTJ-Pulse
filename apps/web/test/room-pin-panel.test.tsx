import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RoomPinPanel } from '../src/features/realtime/room-pin-panel';
import type { useRoomRealtime } from '../src/features/realtime/use-room-realtime';

const pin = {
  id: 'pin-1', roomId: 'room-1', creatorId: 'alice', type: 'meeting' as const, title: '原集合点',
  description: null, longitude: 121.5, latitude: 31.28, status: 'active' as const,
  visibility: 'room' as const, version: 2, expiresAt: null,
  createdAt: '2026-07-17T00:00:00.000Z', updatedAt: '2026-07-17T00:00:00.000Z',
};

function realtime(overrides: Partial<ReturnType<typeof useRoomRealtime>> = {}) {
  return {
    accessToken: '',
    connectionStatus: 'connected',
    configureAccessToken: vi.fn(),
    createPin: vi.fn(() => 'create-request'),
    deletePin: vi.fn(() => 'delete-request'),
    device: {},
    error: null,
    errorCode: null,
    errorRequestId: null,
    members: [],
    pauseSharing: vi.fn(),
    pinLoadError: null,
    pins: [pin],
    refreshPins: vi.fn(async () => undefined),
    startSharing: vi.fn(),
    stopSharing: vi.fn(),
    updatePin: vi.fn(() => 'update-request'),
    ...overrides,
  } as unknown as ReturnType<typeof useRoomRealtime>;
}

afterEach(() => vi.restoreAllMocks());

describe('RoomPinPanel', () => {
  it('retains local edits and reloads the latest pin after an optimistic-version conflict', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const updatePin = vi.fn(() => 'update-request');
    const refreshPins = vi.fn(async () => undefined);
    const baseProps = {
      draft: null,
      onDraftChange: vi.fn(),
      onPlacingChange: vi.fn(),
      onSelectPin: vi.fn(),
      placing: false,
      roomId: 'room-1',
      selectedPinId: 'pin-1',
    };
    const { rerender } = render(<RoomPinPanel {...baseProps} realtime={realtime({ updatePin, refreshPins })} />);
    const title = screen.getByLabelText('标题');
    fireEvent.change(title, { target: { value: '本地保留的标题' } });
    fireEvent.click(screen.getByRole('button', { name: '保存版本' }));
    expect(updatePin).toHaveBeenCalledWith('pin-1', { expectedVersion: 2, title: '本地保留的标题' });

    rerender(<RoomPinPanel {...baseProps} realtime={realtime({
      updatePin,
      refreshPins,
      errorCode: 'PIN_VERSION_CONFLICT',
      errorRequestId: 'update-request',
      pins: [{ ...pin, title: '其他成员的新版本', version: 3 }],
    })} />);
    expect(await screen.findByText(/已被其他成员更新/)).toBeInTheDocument();
    expect(screen.getByLabelText('标题')).toHaveValue('本地保留的标题');
    await waitFor(() => expect(refreshPins).toHaveBeenCalled());
  });
});
