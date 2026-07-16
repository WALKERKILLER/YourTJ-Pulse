import 'dart:convert';

class CampusStyleRepository {
  CampusStyleRepository({required Uri apiBaseUri})
      : tileTemplate = '${apiBaseUri.resolve('/tiles/campus/')}{z}/{x}/{y}.pbf';

  final String tileTemplate;

  String style({required bool dark}) => jsonEncode({
        'version': 8,
        'name': dark ? 'YourTJ Campus Dark' : 'YourTJ Campus Light',
        'glyphs': 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        'sources': {
          'tongji': {
            'type': 'vector',
            'tiles': [tileTemplate],
            'minzoom': 12,
        'maxzoom': 14,
            'attribution': '© OpenStreetMap contributors',
          },
        },
        'layers': [
          {
            'id': 'campus-background',
            'type': 'background',
            'paint': {'background-color': dark ? '#111827' : '#f7f3ed'},
          },
          {
            'id': 'campus-water',
            'type': 'fill',
            'source': 'tongji',
            'source-layer': 'water',
            'paint': {'fill-color': dark ? '#24445a' : '#b9dcea'},
          },
          {
            'id': 'campus-roads',
            'type': 'line',
            'source': 'tongji',
            'source-layer': 'roads',
            'paint': {
              'line-color': dark ? '#8b93a7' : '#ffffff',
              'line-width': 2.5
            },
          },
          {
            'id': 'campus-buildings',
            'type': 'fill',
            'source': 'tongji',
            'source-layer': 'buildings',
            'paint': {
              'fill-color': dark ? '#374151' : '#d9c8b4',
              'fill-outline-color': dark ? '#64748b' : '#9d8268',
            },
          },
        ],
      });
}
