import { describe, expect, it } from 'vitest';
import { buildTwinMovementPlan, calculateCampusRoutes, deriveTwinBehavior, evaluateRouteProgress, nextRouteInstruction, projectTwinMovement, ROUTE_PROFILE_RULES, searchCampusPlaces, type NavigationGraph, type NavigationPlace, type SearchIndex } from '../src';
import twinVectors from '../../contracts/generated/twin_projection_vectors.json';

const graph: NavigationGraph = {
  version: 1,
  campusId: 'test-campus',
  directed: true,
  nodes: [
    { id: 'a', longitude: 0, latitude: 0, x: 0, y: 0, kind: 'path' },
    { id: 'b', longitude: 0.001, latitude: 0, x: 1, y: 0, kind: 'path' },
    { id: 'c', longitude: 0, latitude: 0.001, x: 0, y: 2, kind: 'path' },
    { id: 'd', longitude: 0.001, latitude: 0.001, x: 1, y: 2, kind: 'path' },
  ],
  edges: [
    { id: 'ab', from: 'a', to: 'b', distance: 1, walking: true, cycling: false, wheelchair: false, stairs: true, covered: false, indoor: false, surface: null, access: null },
    { id: 'bd', from: 'b', to: 'd', distance: 1, walking: true, cycling: false, wheelchair: false, stairs: true, covered: false, indoor: false, surface: null, access: null },
    { id: 'ac', from: 'a', to: 'c', distance: 2, walking: true, cycling: true, wheelchair: true, stairs: false, covered: false, indoor: false, surface: 'paved', access: null },
    { id: 'cd', from: 'c', to: 'd', distance: 2, walking: true, cycling: true, wheelchair: true, stairs: false, covered: false, indoor: false, surface: 'paved', access: null },
  ],
};

const places: NavigationPlace[] = [
  { id: 'origin', name: '起点', longitude: 0, latitude: 0, entranceNodeIds: ['a'] },
  { id: 'destination', name: '终点', longitude: 0.001, latitude: 0.001, entranceNodeIds: ['d'] },
];

describe('campus navigation', () => {
  it('returns coordinates, duration, and instructions for walking', () => {
    const [route] = calculateCampusRoutes(graph, places, { origin: { placeId: 'origin' }, destination: { placeId: 'destination' }, profile: 'walking' });
    expect(route?.nodeIds).toEqual(['a', 'b', 'd']);
    expect(route?.distanceMeters).toBe(2);
    expect(route?.durationSeconds).toBeGreaterThan(0);
    expect(route?.instructions.at(-1)?.type).toBe('arrive');
  });

  it('uses the accessible alternative and resolves coordinate inputs', () => {
    const [route] = calculateCampusRoutes(graph, places, { origin: { longitude: 0, latitude: 0 }, destination: { placeId: 'destination' }, profile: 'wheelchair' });
    expect(route?.nodeIds).toEqual(['a', 'c', 'd']);
    expect(route?.edgeIds).not.toContain('ab');
  });

  it('detects off-route and arrival states', () => {
    const [route] = calculateCampusRoutes(graph, places, { origin: { placeId: 'origin' }, destination: { placeId: 'destination' }, profile: 'walking' });
    expect(route).toBeDefined();
    if (!route) return;
    expect(evaluateRouteProgress(route, { longitude: 0.0005, latitude: 0 }).offRoute).toBe(false);
    expect(evaluateRouteProgress(route, { longitude: 0.01, latitude: 0.01 }).offRoute).toBe(true);
    expect(evaluateRouteProgress(route, { longitude: 0.001, latitude: 0.001 }).arrived).toBe(true);
    expect(nextRouteInstruction(route, { longitude: 0.0005, latitude: 0 })?.type).toBe('turn-left');
    expect(nextRouteInstruction(route, { longitude: 0.001, latitude: 0.0005 })?.type).toBe('arrive');
    expect(ROUTE_PROFILE_RULES.profiles.wheelchair.stairsAllowed).toBe(false);
  });

  it('ranks names, pinyin, aliases, categories, and descriptions', () => {
    const index: SearchIndex = { version: 1, campusId: 'test-campus', documents: [{ ...places[0]!, aliases: ['Southwest Dorm'], category: 'dormitory', description: '打印 充电', initials: 'xnyl', number: 'S1', pinyin: 'xi nan yi lou', searchText: '西南一楼 southwest dorm dormitory 打印 充电 xnyl s1 xi nan yi lou' }] };
    for (const query of ['西南', 'xinan', 'xnyl', 'S1', 'dormitory', '打印']) expect(searchCampusPlaces(index, query)[0]?.id).toBe('origin');
  });

  it('derives the same simulated position from a movement plan and timestamp', () => {
    const [route] = calculateCampusRoutes(graph, places, { origin: { placeId: 'origin' }, destination: { placeId: 'destination' }, profile: 'walking' });
    expect(route).toBeDefined();
    if (!route) return;
    const eventStartAt = Date.parse('2026-07-17T01:00:00.000Z');
    const plan = buildTwinMovementPlan({
      id: 'plan-1', userId: 'user-1', eventId: 'event-1', originPlaceId: 'origin', destinationPlaceId: 'destination',
      eventStartAt, movementType: 'walk', route, routeVersion: graph.version, arrivalLeadTimeMs: 60_000,
    });
    const midpoint = projectTwinMovement(plan, graph, (plan.startedAt + plan.expectedArrivalAt) / 2);
    expect(midpoint.kind).toBe('twin_simulated');
    expect(midpoint.progress).toBe(0.5);
    expect(midpoint.longitude).toBeCloseTo(0.001, 6);
    expect(midpoint.latitude).toBeCloseTo(0, 6);
    expect(deriveTwinBehavior(plan, { eventType: 'class', eventStartAt, eventEndAt: eventStartAt + 3_600_000 }, plan.startedAt - 1)).toBe('preparing');
    expect(deriveTwinBehavior(plan, { eventType: 'class', eventStartAt, eventEndAt: eventStartAt + 3_600_000 }, plan.startedAt)).toBe('walking');
    expect(deriveTwinBehavior(plan, { eventType: 'class', eventStartAt, eventEndAt: eventStartAt + 3_600_000 }, plan.expectedArrivalAt)).toBe('arrived');
    expect(deriveTwinBehavior(plan, { eventType: 'class', eventStartAt, eventEndAt: eventStartAt + 3_600_000 }, eventStartAt)).toBe('in_class');
  });

  it('matches the generated cross-client twin projection vectors', () => {
    const vectorGraph: NavigationGraph = {
      version: twinVectors.version,
      campusId: 'golden',
      directed: true,
      edges: [],
      nodes: twinVectors.nodes.map((node) => ({ ...node, kind: 'path' as const })),
    };
    for (const expected of twinVectors.cases) {
      const actual = projectTwinMovement({ ...twinVectors.plan, movementType: twinVectors.plan.movementType as 'walk' }, vectorGraph, expected.timestamp);
      expect(actual).toMatchObject({ kind: 'twin_simulated', progress: expected.progress });
      expect(actual.longitude).toBeCloseTo(expected.longitude, 8);
      expect(actual.latitude).toBeCloseTo(expected.latitude, 8);
      expect(actual.x).toBeCloseTo(expected.x, 8);
      expect(actual.y).toBeCloseTo(expected.y, 8);
    }
  });
});
