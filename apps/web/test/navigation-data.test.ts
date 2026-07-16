import { calculateCampusRoutes, searchCampusPlaces, type NavigationGraph, type NavigationPlace, type SearchIndex } from '@yourtj/campus-navigation';
import { describe, expect, it } from 'vitest';
import graphData from '../../../data/generated/navigation-graph.json';
import placesData from '../../../data/generated/places.json';
import searchIndexData from '../../../data/generated/search-index.json';

const graph = graphData as NavigationGraph;
const places = placesData as NavigationPlace[];
const searchIndex = searchIndexData as SearchIndex;

describe('generated campus navigation data', () => {
  it('searches Chinese, pinyin, English aliases, categories, and descriptions', () => {
    expect(searchCampusPlaces(searchIndex, '西南一')[0]?.name).toContain('西南一');
    expect(searchCampusPlaces(searchIndex, 'xinan yi')[0]?.name).toContain('西南一');
    expect(searchCampusPlaces(searchIndex, 'library').some((place) => place.category === 'library')).toBe(true);
    expect(searchCampusPlaces(searchIndex, '快递')[0]?.name).toContain('驿站');
    expect(searchCampusPlaces(searchIndex, 'restaurant').some((place) => place.category === 'restaurant')).toBe(true);
  });

  it('routes between a dormitory and a teaching building with shared rules', () => {
    const origin = searchIndex.documents.find((place) => /学三楼|西南一楼|西北一楼/.test(place.name));
    const destination = searchIndex.documents.find((place) => /海洋学院|教学南楼|教学北楼/.test(place.name));
    expect(origin).toBeDefined();
    expect(destination).toBeDefined();
    if (!origin || !destination) return;
    const [route] = calculateCampusRoutes(graph, places, { origin: { placeId: origin.id }, destination: { placeId: destination.id }, profile: 'walking' }, { alternativeCount: 3 });
    expect(route?.coordinates.length).toBeGreaterThan(1);
    expect(route?.distanceMeters).toBeGreaterThan(0);
    expect(route?.instructions.at(-1)?.type).toBe('arrive');
  });
});
