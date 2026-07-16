/// <reference lib="webworker" />

import { calculateCampusRoutes, type NavigationGraph, type NavigationPlace, type RouteRequest } from '@yourtj/campus-navigation';
import graphData from '../../../../data/generated/navigation-graph.json';
import placesData from '../../../../data/generated/places.json';
import worldConfig from '../../../../data/generated/world-config.json';

interface NavigationWorkerRequest {
  id: number;
  request: RouteRequest;
}

const graph = graphData as NavigationGraph;
const places = placesData as NavigationPlace[];

self.addEventListener('message', (event: MessageEvent<NavigationWorkerRequest>) => {
  try {
    const routes = calculateCampusRoutes(graph, places, event.data.request, {
      alternativeCount: 3,
      metersPerSceneUnit: worldConfig.metersPerSceneUnit,
    });
    self.postMessage({ id: event.data.id, routes });
  } catch (error) {
    self.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : 'Route calculation failed' });
  }
});
