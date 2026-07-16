import routeProfileRules from '../route-profiles.json';

export type RouteProfile = 'walking' | 'cycling' | 'wheelchair';

export interface NavigationCoordinate {
  latitude: number;
  longitude: number;
}

export interface NavigationPlace extends NavigationCoordinate {
  entranceNodeIds: string[];
  id: string;
  name: string;
}

export type PlaceOrCoordinate = { placeId: string } | NavigationCoordinate;

export interface NavigationNode extends NavigationCoordinate {
  id: string;
  kind: 'entrance' | 'path';
  x: number;
  y: number;
}

export interface NavigationEdge {
  access: string | null;
  covered: boolean;
  cycling: boolean;
  distance: number;
  from: string;
  id: string;
  indoor: boolean;
  stairs: boolean;
  surface: string | null;
  to: string;
  walking: boolean;
  wheelchair: boolean;
}

export interface NavigationGraph {
  campusId: string;
  directed: true;
  edges: NavigationEdge[];
  nodes: NavigationNode[];
  version: number;
}

export type RouteInstructionType = 'arrive' | 'continue' | 'depart' | 'turn-left' | 'turn-right';

export interface RouteInstruction {
  coordinate: [number, number];
  distanceMeters: number;
  nodeId: string;
  text: string;
  type: RouteInstructionType;
}

export interface CampusRoute {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  edgeIds: string[];
  id: string;
  instructions: RouteInstruction[];
  nodeIds: string[];
  profile: RouteProfile;
}

export interface RouteRequest {
  destination: PlaceOrCoordinate;
  origin: PlaceOrCoordinate;
  profile: RouteProfile;
}

export interface RouteOptions {
  alternativeCount?: number;
  metersPerSceneUnit?: number;
}

export interface SearchDocument extends NavigationPlace {
  aliases: string[];
  category: string;
  description: string;
  initials: string;
  number: string;
  pinyin: string;
  searchText: string;
}

export interface SearchIndex {
  campusId: string;
  documents: SearchDocument[];
  version: number;
}

export interface RouteProgress {
  arrived: boolean;
  distanceToDestinationMeters: number;
  distanceToRouteMeters: number;
  offRoute: boolean;
}

export type TwinMovementType = 'walk' | 'run' | 'bike';
export type TwinBehaviorState = 'idle' | 'preparing' | 'walking' | 'running' | 'cycling' | 'arrived' | 'in_class' | 'eating' | 'studying' | 'exercising' | 'returning_home' | 'sleeping';
export type TwinEventType = 'class' | 'meal' | 'study' | 'exercise' | 'club' | 'custom';

export interface TwinMovementPlanData {
  destinationPlaceId: string;
  eventId: string;
  expectedArrivalAt: number;
  id: string;
  movementType: TwinMovementType;
  originPlaceId: string;
  pathNodeIds: string[];
  routeVersion: number;
  speedMetersPerSecond: number;
  startedAt: number;
  userId: string;
}

export interface TwinProjection extends NavigationCoordinate {
  headingDegrees: number;
  kind: 'twin_simulated';
  progress: number;
  x: number;
  y: number;
}

export interface BuildTwinMovementPlanInput {
  arrivalLeadTimeMs?: number;
  destinationPlaceId: string;
  eventId: string;
  eventStartAt: string | number;
  id: string;
  movementType: TwinMovementType;
  originPlaceId: string;
  route: CampusRoute;
  routeVersion: number;
  userId: string;
}

export const TWIN_SPEED_METERS_PER_SECOND: Readonly<Record<TwinMovementType, number>> = {
  walk: 1.35,
  run: 2.8,
  bike: 4.5,
};

export function buildTwinMovementPlan(input: BuildTwinMovementPlanInput): TwinMovementPlanData {
  const eventStartAt = typeof input.eventStartAt === 'number' ? input.eventStartAt : Date.parse(input.eventStartAt);
  if (!Number.isFinite(eventStartAt)) throw new Error('INVALID_TWIN_EVENT_START');
  if (input.route.nodeIds.length < 2 || input.route.distanceMeters <= 0) throw new Error('INVALID_TWIN_ROUTE');
  const speedMetersPerSecond = TWIN_SPEED_METERS_PER_SECOND[input.movementType];
  const expectedArrivalAt = Math.max(1, Math.floor(eventStartAt - (input.arrivalLeadTimeMs ?? 5 * 60_000)));
  const travelTimeMs = Math.max(1, Math.ceil(input.route.distanceMeters / speedMetersPerSecond * 1_000));
  return {
    id: input.id,
    userId: input.userId,
    eventId: input.eventId,
    originPlaceId: input.originPlaceId,
    destinationPlaceId: input.destinationPlaceId,
    pathNodeIds: [...input.route.nodeIds],
    startedAt: Math.max(0, expectedArrivalAt - travelTimeMs),
    expectedArrivalAt,
    speedMetersPerSecond,
    movementType: input.movementType,
    routeVersion: input.routeVersion,
  };
}

export function projectTwinMovement(plan: TwinMovementPlanData, graph: NavigationGraph, timestamp: number): TwinProjection {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const nodes = plan.pathNodeIds.map((nodeId) => nodesById.get(nodeId));
  if (nodes.some((node) => !node) || nodes.length < 2) throw new Error('INVALID_TWIN_PLAN_PATH');
  const routeNodes = nodes as NavigationNode[];
  const progress = Math.max(0, Math.min(1, (timestamp - plan.startedAt) / (plan.expectedArrivalAt - plan.startedAt)));
  const distances = routeNodes.slice(1).map((node, index) => coordinateDistanceMeters(routeNodes[index]!, node));
  const totalDistance = distances.reduce((sum, distance) => sum + distance, 0);
  let remaining = totalDistance * progress;
  let segmentIndex = 0;
  for (; segmentIndex < distances.length - 1 && remaining > distances[segmentIndex]!; segmentIndex += 1) {
    remaining -= distances[segmentIndex]!;
  }
  const start = routeNodes[segmentIndex]!;
  const end = routeNodes[Math.min(segmentIndex + 1, routeNodes.length - 1)]!;
  const segmentDistance = distances[segmentIndex] ?? 0;
  const segmentProgress = segmentDistance > 0 ? Math.max(0, Math.min(1, remaining / segmentDistance)) : 0;
  const interpolate = (left: number, right: number) => left + (right - left) * segmentProgress;
  return {
    kind: 'twin_simulated',
    longitude: interpolate(start.longitude, end.longitude),
    latitude: interpolate(start.latitude, end.latitude),
    x: interpolate(start.x, end.x),
    y: interpolate(start.y, end.y),
    headingDegrees: (Math.atan2(end.x - start.x, end.y - start.y) * 180 / Math.PI + 360) % 360,
    progress,
  };
}

export interface TwinBehaviorContext {
  eventEndAt?: string | number | null;
  eventStartAt: string | number;
  eventType: TwinEventType;
  preparingDurationMs?: number;
  returningHome?: boolean;
  sleeping?: boolean;
}

export function deriveTwinBehavior(plan: TwinMovementPlanData, context: TwinBehaviorContext, timestamp: number): TwinBehaviorState {
  const eventStartAt = typeof context.eventStartAt === 'number' ? context.eventStartAt : Date.parse(context.eventStartAt);
  const eventEndAt = context.eventEndAt == null
    ? eventStartAt
    : typeof context.eventEndAt === 'number' ? context.eventEndAt : Date.parse(context.eventEndAt);
  if (context.sleeping && timestamp >= eventEndAt) return 'sleeping';
  if (timestamp < plan.startedAt - (context.preparingDurationMs ?? 5 * 60_000)) return 'idle';
  if (timestamp < plan.startedAt) return 'preparing';
  if (timestamp < plan.expectedArrivalAt) {
    if (context.returningHome) return 'returning_home';
    return { walk: 'walking', run: 'running', bike: 'cycling' }[plan.movementType] as TwinBehaviorState;
  }
  if (timestamp < eventStartAt) return 'arrived';
  if (timestamp <= eventEndAt) {
    return { class: 'in_class', meal: 'eating', study: 'studying', exercise: 'exercising', club: 'arrived', custom: 'arrived' }[context.eventType] as TwinBehaviorState;
  }
  return 'idle';
}

export const ROUTE_PROFILE_RULES = routeProfileRules;

const ROUGH_SURFACES = new Set<string>(ROUTE_PROFILE_RULES.roughSurfaces);

export function normalizeQuery(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, ' ').trim();
}

export function coordinateDistanceMeters(left: NavigationCoordinate, right: NavigationCoordinate): number {
  const latitudeRadians = (left.latitude + right.latitude) * Math.PI / 360;
  const east = (right.longitude - left.longitude) * Math.PI / 180 * 6_378_137 * Math.cos(latitudeRadians);
  const north = (right.latitude - left.latitude) * Math.PI / 180 * 6_378_137;
  return Math.hypot(east, north);
}

function distanceToSegmentMeters(position: NavigationCoordinate, start: NavigationCoordinate, end: NavigationCoordinate): number {
  const latitudeRadians = position.latitude * Math.PI / 180;
  const toLocalMeters = (point: NavigationCoordinate): [number, number] => [
    (point.longitude - position.longitude) * Math.PI / 180 * 6_378_137 * Math.cos(latitudeRadians),
    (point.latitude - position.latitude) * Math.PI / 180 * 6_378_137,
  ];
  const [startX, startY] = toLocalMeters(start);
  const [endX, endY] = toLocalMeters(end);
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const lengthSquared = deltaX ** 2 + deltaY ** 2;
  if (lengthSquared === 0) return Math.hypot(startX, startY);
  const projection = Math.max(0, Math.min(1, -(startX * deltaX + startY * deltaY) / lengthSquared));
  return Math.hypot(startX + projection * deltaX, startY + projection * deltaY);
}

export function evaluateRouteProgress(route: CampusRoute, position: NavigationCoordinate, offRouteMeters = 35, arrivalMeters = 20): RouteProgress {
  const routePoints = route.coordinates.map(([longitude, latitude]) => ({ longitude, latitude }));
  const destination = routePoints.at(-1) ?? position;
  const segmentDistances = routePoints.slice(1).map((end, index) => distanceToSegmentMeters(position, routePoints[index] ?? end, end));
  const distanceToRouteMeters = segmentDistances.length
    ? Math.min(...segmentDistances)
    : coordinateDistanceMeters(position, destination);
  const distanceToDestinationMeters = coordinateDistanceMeters(position, destination);
  return {
    arrived: distanceToDestinationMeters <= arrivalMeters,
    distanceToDestinationMeters,
    distanceToRouteMeters,
    offRoute: distanceToRouteMeters > offRouteMeters,
  };
}

export function nextRouteInstruction(route: CampusRoute, position: NavigationCoordinate): RouteInstruction | undefined {
  const routePoints = route.coordinates.map(([longitude, latitude]) => ({ longitude, latitude }));
  let nearestSegmentEndIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < routePoints.length - 1; index += 1) {
    const start = routePoints[index];
    const end = routePoints[index + 1];
    if (!start || !end) continue;
    const distance = distanceToSegmentMeters(position, start, end);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestSegmentEndIndex = index + 1;
    }
  }
  return route.instructions.find((instruction) => {
    const nodeIndex = route.nodeIds.indexOf(instruction.nodeId);
    return instruction.type !== 'depart' && nodeIndex >= nearestSegmentEndIndex;
  }) ?? route.instructions.at(-1);
}

export function searchCampusPlaces(index: SearchIndex, query: string, limit = 8): SearchDocument[] {
  const normalized = normalizeQuery(query);
  if (!normalized) return index.documents.slice(0, limit);
  const compact = normalized.replaceAll(' ', '');
  return index.documents
    .flatMap((document) => {
      const name = normalizeQuery(document.name);
      const aliases = document.aliases.map(normalizeQuery);
      const fields: Array<[string, number]> = [
        [name, 100],
        [normalizeQuery(document.number), 92],
        [normalizeQuery(document.pinyin), 88],
        [normalizeQuery(document.initials), 84],
        ...aliases.map((alias): [string, number] => [alias, 80]),
        [normalizeQuery(document.category), 64],
        [normalizeQuery(document.description), 52],
        [normalizeQuery(document.searchText), 30],
      ];
      let score = 0;
      for (const [field, weight] of fields) {
        if (!field) continue;
        const fieldCompact = field.replaceAll(' ', '');
        if (field === normalized || fieldCompact === compact) score = Math.max(score, weight + 20);
        else if (field.startsWith(normalized) || fieldCompact.startsWith(compact)) score = Math.max(score, weight + 10);
        else if (field.includes(normalized) || fieldCompact.includes(compact)) score = Math.max(score, weight);
      }
      return score > 0 ? [{ document, score }] : [];
    })
    .sort((left, right) => right.score - left.score || left.document.name.localeCompare(right.document.name))
    .slice(0, limit)
    .map(({ document }) => document);
}

function supportsProfile(edge: NavigationEdge, profile: RouteProfile): boolean {
  if (edge.stairs && !ROUTE_PROFILE_RULES.profiles[profile].stairsAllowed) return false;
  if (profile === 'cycling') return edge.cycling;
  if (profile === 'wheelchair') return edge.wheelchair && !edge.stairs;
  return edge.walking;
}

function edgeFactor(edge: NavigationEdge, profile: RouteProfile): number {
  const rules = ROUTE_PROFILE_RULES.profiles[profile];
  let factor = 1;
  if (edge.stairs) factor *= rules.stairsFactor;
  if (edge.surface && ROUGH_SURFACES.has(edge.surface)) factor *= rules.roughSurfaceFactor;
  if (edge.access === 'destination' || edge.access === 'customers') factor *= ROUTE_PROFILE_RULES.restrictedAccessPenalty;
  return factor;
}

function pointCandidates(input: PlaceOrCoordinate, places: Map<string, NavigationPlace>, graph: NavigationGraph, profile: RouteProfile): string[] {
  if ('placeId' in input) {
    const place = places.get(input.placeId);
    if (!place) return [];
    const validNodeIds = new Set(graph.nodes.map((node) => node.id));
    const entrances = place.entranceNodeIds.filter((nodeId) => validNodeIds.has(nodeId));
    if (entrances.length) return entrances;
    return nearestNodes(place, graph, profile, 1);
  }
  return nearestNodes(input, graph, profile, 1);
}

function nearestNodes(coordinate: NavigationCoordinate, graph: NavigationGraph, profile: RouteProfile, limit: number): string[] {
  const routable = new Set(graph.edges.filter((edge) => supportsProfile(edge, profile)).flatMap((edge) => [edge.from, edge.to]));
  return graph.nodes
    .filter((node) => routable.has(node.id))
    .map((node) => ({ id: node.id, distance: (node.longitude - coordinate.longitude) ** 2 + (node.latitude - coordinate.latitude) ** 2 }))
    .sort((left, right) => left.distance - right.distance)
    .slice(0, limit)
    .map(({ id }) => id);
}

interface PathResult {
  edgeIds: string[];
  nodeIds: string[];
  score: number;
}

function findPath(
  graph: NavigationGraph,
  startId: string,
  endId: string,
  profile: RouteProfile,
  metersPerSceneUnit: number,
  penalizedEdgeIds: Set<string>,
): PathResult | null {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const target = nodes.get(endId);
  if (!nodes.has(startId) || !target) return null;
  const adjacency = new Map(graph.nodes.map((node) => [node.id, [] as NavigationEdge[]]));
  for (const edge of graph.edges) if (supportsProfile(edge, profile)) adjacency.get(edge.from)?.push(edge);
  const distance = new Map([[startId, 0]]);
  const previous = new Map<string, { edgeId: string; nodeId: string }>();
  const open = new Set([startId]);
  while (open.size) {
    let current = '';
    let bestScore = Number.POSITIVE_INFINITY;
    for (const candidate of open) {
      const node = nodes.get(candidate);
      if (!node) continue;
      const heuristic = Math.hypot(target.x - node.x, target.y - node.y) * metersPerSceneUnit;
      const score = (distance.get(candidate) ?? Number.POSITIVE_INFINITY) + heuristic;
      if (score < bestScore) {
        bestScore = score;
        current = candidate;
      }
    }
    if (!current) break;
    if (current === endId) {
      const nodeIds = [current];
      const edgeIds: string[] = [];
      while (previous.has(current)) {
        const step = previous.get(current);
        if (!step) break;
        edgeIds.push(step.edgeId);
        current = step.nodeId;
        nodeIds.push(current);
      }
      return { nodeIds: nodeIds.reverse(), edgeIds: edgeIds.reverse(), score: distance.get(endId) ?? 0 };
    }
    open.delete(current);
    for (const edge of adjacency.get(current) ?? []) {
      const penalty = penalizedEdgeIds.has(edge.id) ? ROUTE_PROFILE_RULES.alternativeEdgePenalty : 1;
      const candidateDistance = (distance.get(current) ?? Number.POSITIVE_INFINITY) + edge.distance * edgeFactor(edge, profile) * penalty;
      if (candidateDistance < (distance.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        distance.set(edge.to, candidateDistance);
        previous.set(edge.to, { edgeId: edge.id, nodeId: current });
        open.add(edge.to);
      }
    }
  }
  return null;
}

function bearing(from: NavigationNode, to: NavigationNode): number {
  return Math.atan2(to.x - from.x, to.y - from.y) * 180 / Math.PI;
}

function turnDelta(before: number, after: number): number {
  return ((after - before + 540) % 360) - 180;
}

function routeInstructions(nodeIds: string[], edges: NavigationEdge[], nodes: Map<string, NavigationNode>): RouteInstruction[] {
  const first = nodes.get(nodeIds[0] ?? '');
  const last = nodes.get(nodeIds.at(-1) ?? '');
  if (!first || !last) return [];
  const instructions: RouteInstruction[] = [{
    type: 'depart', text: '从起点出发', nodeId: first.id,
    coordinate: [first.longitude, first.latitude], distanceMeters: edges[0]?.distance ?? 0,
  }];
  for (let index = 1; index < nodeIds.length - 1; index += 1) {
    const previousNode = nodes.get(nodeIds[index - 1] ?? '');
    const currentNode = nodes.get(nodeIds[index] ?? '');
    const nextNode = nodes.get(nodeIds[index + 1] ?? '');
    if (!previousNode || !currentNode || !nextNode) continue;
    const delta = turnDelta(bearing(previousNode, currentNode), bearing(currentNode, nextNode));
    if (Math.abs(delta) < 32) continue;
    const type: RouteInstructionType = delta < 0 ? 'turn-left' : 'turn-right';
    instructions.push({
      type,
      text: type === 'turn-left' ? '向左转' : '向右转',
      nodeId: currentNode.id,
      coordinate: [currentNode.longitude, currentNode.latitude],
      distanceMeters: edges[index]?.distance ?? 0,
    });
  }
  if (instructions.length === 1 && nodeIds.length > 2) {
    const middle = nodes.get(nodeIds[Math.floor(nodeIds.length / 2)] ?? '');
    if (middle) instructions.push({ type: 'continue', text: '继续直行', nodeId: middle.id, coordinate: [middle.longitude, middle.latitude], distanceMeters: edges.reduce((sum, edge) => sum + edge.distance, 0) });
  }
  instructions.push({ type: 'arrive', text: '到达目的地', nodeId: last.id, coordinate: [last.longitude, last.latitude], distanceMeters: 0 });
  return instructions;
}

function materializeRoute(path: PathResult, graph: NavigationGraph, profile: RouteProfile, sequence: number): CampusRoute | null {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const routeNodes = path.nodeIds.map((nodeId) => nodes.get(nodeId)).filter((node): node is NavigationNode => Boolean(node));
  const routeEdges = path.edgeIds.map((edgeId) => edgeById.get(edgeId)).filter((edge): edge is NavigationEdge => Boolean(edge));
  if (routeNodes.length !== path.nodeIds.length || routeEdges.length !== path.edgeIds.length) return null;
  const distanceMeters = routeEdges.reduce((sum, edge) => sum + edge.distance, 0);
  const durationSeconds = routeEdges.reduce((sum, edge) => sum + edge.distance * edgeFactor(edge, profile) / ROUTE_PROFILE_RULES.profiles[profile].speedMetersPerSecond, 0);
  return {
    id: `${profile}-${sequence}-${path.nodeIds[0]}-${path.nodeIds.at(-1)}-${path.nodeIds.length}`,
    profile,
    distanceMeters: Math.round(distanceMeters * 10) / 10,
    durationSeconds: Math.max(1, Math.round(durationSeconds)),
    nodeIds: path.nodeIds,
    edgeIds: path.edgeIds,
    coordinates: routeNodes.map((node) => [node.longitude, node.latitude]),
    instructions: routeInstructions(path.nodeIds, routeEdges, nodes),
  };
}

export function calculateCampusRoutes(
  graph: NavigationGraph,
  placesList: NavigationPlace[],
  request: RouteRequest,
  options: RouteOptions = {},
): CampusRoute[] {
  const places = new Map(placesList.map((place) => [place.id, place]));
  const starts = pointCandidates(request.origin, places, graph, request.profile);
  const destinations = pointCandidates(request.destination, places, graph, request.profile);
  const alternativeCount = Math.max(1, Math.min(3, options.alternativeCount ?? 2));
  const penalized = new Set<string>();
  const routes: CampusRoute[] = [];
  for (let sequence = 0; sequence < alternativeCount; sequence += 1) {
    const candidates = starts.flatMap((startId) => destinations.flatMap((endId) => {
      const path = findPath(graph, startId, endId, request.profile, options.metersPerSceneUnit ?? 1, penalized);
      return path ? [path] : [];
    })).sort((left, right) => left.score - right.score);
    const next = candidates.find((candidate) => !routes.some((route) => route.nodeIds.join('|') === candidate.nodeIds.join('|')));
    if (!next) break;
    const route = materializeRoute(next, graph, request.profile, sequence);
    if (!route) break;
    routes.push(route);
    for (const edgeId of next.edgeIds) penalized.add(edgeId);
  }
  return routes;
}
