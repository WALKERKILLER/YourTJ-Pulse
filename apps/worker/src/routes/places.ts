import { calculateCampusRoutes, searchCampusPlaces, type NavigationGraph, type NavigationPlace, type SearchIndex } from '@yourtj/campus-navigation';
import { Hono } from 'hono';
import { z } from 'zod';
import graphData from '../../../../data/generated/navigation-graph.json';
import placesData from '../../../../data/generated/places.json';
import searchIndexData from '../../../../data/generated/search-index.json';
import worldConfig from '../../../../data/generated/world-config.json';

import type { WorkerEnv } from '../types';
import { serveR2Object } from '../services/r2';
import { parseJsonBody } from '../utils/body';
import { identifierParam, parseQuery } from '../utils/params';
import { ApiError, jsonData } from '../utils/responses';

export const placesRouter = new Hono<WorkerEnv>();

const graph = graphData as NavigationGraph;
const places = placesData as NavigationPlace[];
const searchIndex = searchIndexData as SearchIndex;
const placeById = new Map(places.map((place) => [place.id, place]));

const endpointSchema = z.union([
  z.object({ placeId: z.string().min(1).max(128) }).strict(),
  z.object({ longitude: z.number().finite().min(-180).max(180), latitude: z.number().finite().min(-90).max(90) }).strict(),
]);
const routeRequestSchema = z.object({
  origin: endpointSchema,
  destination: endpointSchema,
  profile: z.enum(['walking', 'cycling', 'wheelchair']),
}).strict();
const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(10),
}).strict();

placesRouter.get('/custom-data', (context) => serveR2Object(context, 'data/custom.geojson'));
placesRouter.get('/places', (context) => jsonData(context, places));
placesRouter.get('/places/:id', (context) => {
  const place = placeById.get(identifierParam(context));
  if (!place) throw new ApiError(404, 'PLACE_NOT_FOUND', 'Place was not found');
  return jsonData(context, place);
});
placesRouter.get('/search', (context) => {
  const query = parseQuery(context, searchQuerySchema);
  return jsonData(context, searchCampusPlaces(searchIndex, query.q, query.limit));
});
placesRouter.post('/routes', async (context) => {
  const request = await parseJsonBody(context.req.raw, routeRequestSchema);
  const routes = calculateCampusRoutes(graph, places, request, {
    alternativeCount: 3,
    metersPerSceneUnit: worldConfig.metersPerSceneUnit,
  });
  if (!routes.length) throw new ApiError(404, 'ROUTE_NOT_FOUND', 'No route is available for the requested profile');
  return jsonData(context, routes);
});
