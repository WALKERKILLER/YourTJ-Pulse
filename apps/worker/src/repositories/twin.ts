import { buildTwinMovementPlan, calculateCampusRoutes, type NavigationGraph, type NavigationPlace } from '@yourtj/campus-navigation';
import type { AuthenticatedUser, GenerateTwinMovementPlanInput, TwinMovementPlan, TwinMovementType } from '@yourtj/contracts';

import graphData from '../../../../data/generated/navigation-graph.json';
import placesData from '../../../../data/generated/places.json';
import worldConfig from '../../../../data/generated/world-config.json';
import { ApiError } from '../utils/responses';
import { getTwinProfile } from './business';

const graph = graphData as unknown as NavigationGraph;
const places = placesData as unknown as NavigationPlace[];
const placeIds = new Set(places.map((place) => place.id));

interface TwinEventRow {
  destination_place_id: string | null;
  id: string;
  origin_place_id: string | null;
  start_at: string;
  user_id: string;
}

interface TwinPlanRow {
  created_at: string;
  destination_place_id: string;
  event_id: string;
  expected_arrival_at: number;
  id: string;
  movement_type: TwinMovementType;
  origin_place_id: string;
  path_node_ids_json: string;
  route_version: number;
  speed_meters_per_second: number;
  started_at: number;
  status: TwinMovementPlan['status'];
  updated_at: string;
  user_id: string;
}

function serializePlan(row: TwinPlanRow): TwinMovementPlan {
  return {
    id: row.id,
    userId: row.user_id,
    eventId: row.event_id,
    originPlaceId: row.origin_place_id,
    destinationPlaceId: row.destination_place_id,
    pathNodeIds: JSON.parse(row.path_node_ids_json) as string[],
    startedAt: row.started_at,
    expectedArrivalAt: row.expected_arrival_at,
    speedMetersPerSecond: row.speed_meters_per_second,
    movementType: row.movement_type,
    routeVersion: row.route_version,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function assertTwinPlaceId(placeId: string | null | undefined, field: string): void {
  if (placeId && !placeIds.has(placeId)) throw new ApiError(400, 'TWIN_PLACE_NOT_FOUND', `${field} must reference a campus place`);
}

async function activePlanForEvent(db: D1Database, userId: string, eventId: string): Promise<TwinMovementPlan | null> {
  await settleArrivedPlans(db, userId);
  const row = await db.prepare(
    "SELECT * FROM twin_movement_plans WHERE user_id = ? AND event_id = ? AND status = 'active' LIMIT 1",
  ).bind(userId, eventId).first<TwinPlanRow>();
  return row ? serializePlan(row) : null;
}

async function settleArrivedPlans(db: D1Database, userId: string): Promise<void> {
  await db.prepare(
    "UPDATE twin_movement_plans SET status = 'arrived', updated_at = ? WHERE user_id = ? AND status = 'active' AND expected_arrival_at <= ?",
  ).bind(new Date().toISOString(), userId, Date.now()).run();
}

export async function generateTwinMovementPlan(
  db: D1Database,
  user: AuthenticatedUser,
  input: GenerateTwinMovementPlanInput,
): Promise<TwinMovementPlan> {
  const profile = await getTwinProfile(db, user.id);
  if (!profile.enabled || !profile.simulationEnabled) {
    throw new ApiError(403, 'TWIN_SIMULATION_DISABLED', 'Twin simulation requires explicit opt-in');
  }
  const existing = await activePlanForEvent(db, user.id, input.eventId);
  if (existing) return existing;
  const event = await db.prepare('SELECT * FROM twin_events WHERE id = ? AND user_id = ?')
    .bind(input.eventId, user.id).first<TwinEventRow>();
  if (!event) throw new ApiError(404, 'TWIN_EVENT_NOT_FOUND', 'Twin event was not found');
  const originPlaceId = event.origin_place_id ?? profile.homePlaceId;
  if (!originPlaceId) throw new ApiError(400, 'TWIN_HOME_REQUIRED', 'Event origin or twin home place is required');
  if (!event.destination_place_id) throw new ApiError(400, 'TWIN_DESTINATION_REQUIRED', 'Event destination is required');
  assertTwinPlaceId(originPlaceId, 'originPlaceId');
  assertTwinPlaceId(event.destination_place_id, 'destinationPlaceId');
  const routes = calculateCampusRoutes(graph, places, {
    origin: { placeId: originPlaceId },
    destination: { placeId: event.destination_place_id },
    profile: input.movementType === 'bike' ? 'cycling' : 'walking',
  }, { alternativeCount: 1, metersPerSceneUnit: worldConfig.metersPerSceneUnit });
  const route = routes[0];
  if (!route) throw new ApiError(422, 'TWIN_ROUTE_NOT_FOUND', 'No campus route connects the twin event places');
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const plan = buildTwinMovementPlan({
    id,
    userId: user.id,
    eventId: event.id,
    originPlaceId,
    destinationPlaceId: event.destination_place_id,
    eventStartAt: event.start_at,
    movementType: input.movementType,
    route,
    routeVersion: graph.version,
  });
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO twin_movement_plans (
          id, user_id, event_id, origin_place_id, destination_place_id, path_node_ids_json,
          started_at, expected_arrival_at, speed_meters_per_second, movement_type, route_version,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      ).bind(
        plan.id, plan.userId, plan.eventId, plan.originPlaceId, plan.destinationPlaceId,
        JSON.stringify(plan.pathNodeIds), plan.startedAt, plan.expectedArrivalAt, plan.speedMetersPerSecond,
        plan.movementType, plan.routeVersion, timestamp, timestamp,
      ),
      db.prepare(
        `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata_json, created_at)
         VALUES (?, ?, 'twin.plan.generate', 'twin_movement_plan', ?, ?, ?)`,
      ).bind(crypto.randomUUID(), user.id, plan.id, JSON.stringify({ eventId: plan.eventId, routeVersion: plan.routeVersion }), timestamp),
    ]);
  } catch (error) {
    const raced = await activePlanForEvent(db, user.id, input.eventId);
    if (raced) return raced;
    throw error;
  }
  return { ...plan, status: 'active', createdAt: timestamp, updatedAt: timestamp };
}

export async function listTwinMovementPlans(db: D1Database, userId: string): Promise<TwinMovementPlan[]> {
  await settleArrivedPlans(db, userId);
  const result = await db.prepare('SELECT * FROM twin_movement_plans WHERE user_id = ? ORDER BY started_at DESC LIMIT 500')
    .bind(userId).all<TwinPlanRow>();
  return result.results.map(serializePlan);
}

export async function cancelTwinMovementPlan(db: D1Database, user: AuthenticatedUser, planId: string): Promise<TwinMovementPlan> {
  const current = await db.prepare('SELECT * FROM twin_movement_plans WHERE id = ? AND user_id = ?')
    .bind(planId, user.id).first<TwinPlanRow>();
  if (!current) throw new ApiError(404, 'TWIN_PLAN_NOT_FOUND', 'Twin movement plan was not found');
  if (current.status === 'cancelled') return serializePlan(current);
  const timestamp = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE twin_movement_plans SET status = 'cancelled', updated_at = ? WHERE id = ? AND user_id = ?")
      .bind(timestamp, planId, user.id),
    db.prepare(
      `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata_json, created_at)
       VALUES (?, ?, 'twin.plan.cancel', 'twin_movement_plan', ?, NULL, ?)`,
    ).bind(crypto.randomUUID(), user.id, planId, timestamp),
  ]);
  return serializePlan({ ...current, status: 'cancelled', updated_at: timestamp });
}
