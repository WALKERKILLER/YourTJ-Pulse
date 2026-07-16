import '../contracts/contracts.dart';

typedef JsonRequest = Future<Object?> Function(String method, Uri uri,
    {Object? body});

class CampusApiRepository {
  const CampusApiRepository({required this.baseUri, required this.request});

  final Uri baseUri;
  final JsonRequest request;

  Future<List<CampusPlace>> loadPlaces() async {
    final payload = await request('GET', baseUri.resolve('/api/places'));
    return _items(payload).map(CampusPlace.fromJson).toList(growable: false);
  }

  Future<List<Pin>> loadPins({String? roomId}) async {
    final uri = baseUri
        .resolve('/api/pins')
        .replace(queryParameters: roomId == null ? null : {'roomId': roomId});
    final payload = await request('GET', uri);
    return _items(payload).map(Pin.fromJson).toList(growable: false);
  }

  Future<List<NavigationRoute>> findRoutes(
      {required CampusCoordinate origin,
      required CampusPlace destination,
      String profile = 'walking'}) async {
    final payload =
        await request('POST', baseUri.resolve('/api/routes'), body: {
      'origin': {'longitude': origin.longitude, 'latitude': origin.latitude},
      'destination': {'placeId': destination.id},
      'profile': profile,
    });
    return _items(payload)
        .map(NavigationRoute.fromJson)
        .toList(growable: false);
  }

  Future<List<NavigationRoute>> findRoutesBetweenPlaces({
    required String originPlaceId,
    required String destinationPlaceId,
    String profile = 'walking',
  }) async {
    final payload = await request(
      'POST',
      baseUri.resolve('/api/routes'),
      body: {
        'origin': {'placeId': originPlaceId},
        'destination': {'placeId': destinationPlaceId},
        'profile': profile,
      },
    );
    return _items(payload)
        .map(NavigationRoute.fromJson)
        .toList(growable: false);
  }

  Future<String> currentUserId() async {
    final payload =
        await request('GET', baseUri.resolve('/api/me')) as CampusJsonMap;
    return (payload['data'] as CampusJsonMap)['id'] as String;
  }

  Future<void> joinRoom(String roomId) async {
    await request('POST', baseUri.resolve('/api/rooms/$roomId/join'));
  }

  Future<List<TwinMovementPlan>> loadTwinPlans() async {
    final payload = await request('GET', baseUri.resolve('/api/twin/plans'));
    return _items(payload)
        .map(TwinMovementPlan.fromJson)
        .toList(growable: false);
  }

  Iterable<CampusJsonMap> _items(Object? payload) {
    final root = payload as CampusJsonMap;
    final data = root['data'];
    final items = data is List<dynamic>
        ? data
        : (data as CampusJsonMap)['items'] as List<dynamic>;
    return items.cast<CampusJsonMap>();
  }
}
