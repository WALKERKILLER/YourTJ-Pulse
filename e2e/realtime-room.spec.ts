import { expect, test, type BrowserContext, type WebSocketRoute } from '@playwright/test';

interface ClientMessage {
  payload: Record<string, unknown>;
  requestId: string;
  type: string;
}

interface MockMember {
  connectionStatus: 'live';
  displayName: string;
  joinedAt: number;
  locationSharingLevel: 'precise' | 'approximate' | 'hidden';
  presence: 'available' | 'away';
  sharingLocation: boolean;
  updatedAt: number;
  userId: string;
}

const roomId = 'e2e-room';

test('two clients share approximate location, collaborate on a Pin, and reconnect', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The multi-context journey runs once; browser coverage is provided by privacy.spec.ts.');

  let sequence = 0;
  let pin: Record<string, unknown> | null = null;
  const sockets = new Map<string, WebSocketRoute>();
  const members = new Map<string, MockMember>();
  const messages = new Map<string, ClientMessage[]>();
  const connectionCounts = new Map<string, number>();

  const send = (socket: WebSocketRoute, type: string, payload: unknown, requestId?: string): void => {
    sequence += 1;
    socket.send(JSON.stringify({
      type,
      eventId: `event-${sequence}`,
      sequence,
      sentAt: Date.now(),
      ...(requestId ? { requestId } : {}),
      payload,
    }));
  };
  const broadcast = (type: string, payload: unknown, requestId?: string): void => {
    for (const socket of sockets.values()) send(socket, type, payload, requestId);
  };

  const configureContext = async (context: BrowserContext, userId: string): Promise<void> => {
    messages.set(userId, []);
    await context.grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:4173' });
    await context.setGeolocation({ longitude: 121.501234, latitude: 31.282345, accuracy: 8 });
    await context.route('**/api/telemetry', (route) => route.fulfill({
      status: 202, contentType: 'application/json', body: '{"data":{"accepted":true}}',
    }));
    await context.route(`**/api/pins?roomId=${roomId}`, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: pin ? [pin] : [] }),
    }));
    await context.route('**/api/pins/pin-e2e/*', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: '{"data":[]}',
    }));
    await context.route('**/tiles/tongji.pmtiles', (route) => route.fulfill({ status: 404, body: '' }));
    await context.routeWebSocket(/\/api\/realtime\/rooms\/e2e-room$/, (socket) => {
      sockets.set(userId, socket);
      connectionCounts.set(userId, (connectionCounts.get(userId) ?? 0) + 1);
      socket.onMessage((raw) => {
        const message = JSON.parse(String(raw)) as ClientMessage;
        messages.get(userId)?.push(message);
        if (message.type === 'room.join') {
          const now = Date.now();
          const member: MockMember = members.get(userId) ?? {
            userId,
            displayName: userId === 'alice' ? 'Alice' : 'Bob',
            presence: 'available',
            sharingLocation: false,
            locationSharingLevel: 'hidden',
            connectionStatus: 'live',
            joinedAt: now,
            updatedAt: now,
          };
          members.set(userId, member);
          send(socket, 'room.snapshot', { roomId, members: [...members.values()] }, message.requestId);
          for (const [otherId, otherSocket] of sockets) {
            if (otherId !== userId) send(otherSocket, 'member.joined', { member }, message.requestId);
          }
        } else if (message.type === 'presence.update') {
          const current = members.get(userId)!;
          const next: MockMember = {
            ...current,
            presence: message.payload.status as MockMember['presence'],
            sharingLocation: message.payload.sharingLocation as boolean,
            locationSharingLevel: message.payload.locationSharingLevel as MockMember['locationSharingLevel'],
            updatedAt: Date.now(),
          };
          members.set(userId, next);
          broadcast('member.presence', {
            userId,
            presence: next.presence,
            sharingLocation: next.sharingLocation,
            locationSharingLevel: next.locationSharingLevel,
            updatedAt: next.updatedAt,
          }, message.requestId);
        } else if (message.type === 'location.update') {
          broadcast('member.location', {
            userId,
            location: {
              seq: message.payload.seq,
              longitude: 121.501,
              latitude: 31.282,
              accuracy: 80,
              kind: 'gps',
            },
            receivedAt: Date.now(),
          }, message.requestId);
        } else if (message.type === 'pin.create') {
          const input = message.payload.pin as Record<string, unknown>;
          pin = {
            ...input,
            id: 'pin-e2e',
            creatorId: userId,
            description: input.description ?? null,
            expiresAt: null,
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          broadcast('pin.created', { pin }, message.requestId);
        } else if (message.type === 'pin.update' && pin) {
          const update = message.payload.update as Record<string, unknown>;
          pin = { ...pin, ...update, version: Number(pin.version) + 1, updatedAt: new Date().toISOString() };
          delete pin.expectedVersion;
          broadcast('pin.updated', { pin }, message.requestId);
        } else if (message.type === 'pin.delete' && pin) {
          broadcast('pin.deleted', {
            pinId: pin.id,
            version: Number(pin.version) + 1,
            deletedAt: new Date().toISOString(),
          }, message.requestId);
          pin = null;
        }
        if (message.type !== 'room.join') {
          send(socket, 'room.ack', { acceptedType: message.type, status: 'accepted' }, message.requestId);
        }
      });
    });
  };

  const aliceContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const bobContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await configureContext(aliceContext, 'alice');
  await configureContext(bobContext, 'bob');
  const alice = await aliceContext.newPage();
  const bob = await bobContext.newPage();

  try {
    await alice.goto(`/room/${roomId}`);
    await bob.goto(`/room/${roomId}`);
    await expect(alice.getByText('实时在线')).toBeVisible();
    await expect(bob.getByText('实时在线')).toBeVisible();
    await expect(alice.locator('.member-count')).toContainText('2');
    await expect(bob.locator('.member-count')).toContainText('2');
    await expect(alice.getByText('未共享', { exact: true })).toBeVisible();

    await alice.getByRole('button', { name: '开始共享' }).click();
    await expect.poll(() => messages.get('alice')?.some((message) => (
      message.type === 'presence.update'
      && message.payload.locationSharingLevel === 'approximate'
    ))).toBe(true);
    await expect.poll(() => messages.get('alice')?.some((message) => message.type === 'location.update')).toBe(true);
    await expect(alice.getByText('正在共享', { exact: true })).toBeVisible();
    await bob.getByRole('button', { name: '开始共享' }).click();
    await expect.poll(() => messages.get('bob')?.some((message) => (
      message.type === 'presence.update'
      && message.payload.locationSharingLevel === 'approximate'
    ))).toBe(true);
    await expect.poll(() => messages.get('bob')?.some((message) => message.type === 'location.update')).toBe(true);

    await alice.getByRole('button', { name: '放置新 Pin' }).click();
    const canvas = alice.locator('.maplibregl-canvas');
    await expect(canvas).toBeVisible();
    await canvas.click({ position: { x: 300, y: 300 } });
    await alice.locator('.detail-panel').getByPlaceholder('发生了什么？').fill('双端集合点');
    await alice.locator('.detail-panel').getByRole('button', { name: '创建并同步' }).click();
    await expect(bob.locator('.detail-panel .pin-list')).toContainText('双端集合点');

    await bob.locator('.detail-panel .pin-list button').filter({ hasText: '双端集合点' }).click();
    await bob.locator('.detail-panel .pin-form input').first().fill('更新后的集合点');
    await bob.locator('.detail-panel').getByRole('button', { name: '保存版本' }).click();
    await expect(alice.locator('.detail-panel .pin-list')).toContainText('更新后的集合点');
    await alice.locator('.detail-panel .pin-list button').filter({ hasText: '更新后的集合点' }).click();
    await alice.locator('.detail-panel').getByRole('button', { name: '删除' }).click();
    await expect(bob.locator('.detail-panel .pin-list')).not.toContainText('更新后的集合点');

    await sockets.get('alice')?.close({ code: 1012, reason: 'E2E reconnect' });
    await expect.poll(() => connectionCounts.get('alice')).toBeGreaterThanOrEqual(2);
    await expect(alice.getByText('实时在线')).toBeVisible();
    await expect(alice.locator('.member-count')).toContainText('2');
    await expect(alice.locator('.detail-panel .pin-list')).not.toContainText('更新后的集合点');
    await alice.getByRole('button', { name: '暂停' }).click();
    await expect.poll(() => messages.get('alice')?.some((message) => (
      message.type === 'presence.update'
      && message.payload.locationSharingLevel === 'hidden'
    ))).toBe(true);
    await bob.getByRole('button', { name: '暂停' }).click();
    await expect.poll(() => messages.get('bob')?.some((message) => (
      message.type === 'presence.update'
      && message.payload.locationSharingLevel === 'hidden'
    ))).toBe(true);
  } finally {
    await aliceContext.close();
    await bobContext.close();
  }
});
