import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const contractRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(contractRoot, '..', '..');
const flutterContractRoot = resolve(repositoryRoot, 'apps', 'flutter', 'lib', 'features', 'map', 'contracts');
const checkOnly = process.argv.includes('--check');

const campusModels = `// GENERATED FILE. Run: pnpm contracts:generate
typedef CampusJsonMap = Map<String, dynamic>;

class CampusCoordinate {
  const CampusCoordinate({required this.longitude, required this.latitude});
  final double longitude;
  final double latitude;

  factory CampusCoordinate.fromPair(List<dynamic> pair) => CampusCoordinate(
    longitude: (pair[0] as num).toDouble(),
    latitude: (pair[1] as num).toDouble(),
  );
}

class CampusPlace {
  const CampusPlace({required this.id, required this.name, required this.longitude, required this.latitude, required this.entranceNodeIds, this.category, this.description});
  final String id;
  final String name;
  final double longitude;
  final double latitude;
  final List<String> entranceNodeIds;
  final String? category;
  final String? description;

  factory CampusPlace.fromJson(CampusJsonMap json) => CampusPlace(
    id: json['id'] as String,
    name: json['name'] as String,
    longitude: (json['longitude'] as num).toDouble(),
    latitude: (json['latitude'] as num).toDouble(),
    entranceNodeIds: (json['entranceNodeIds'] as List<dynamic>).cast<String>(),
    category: json['category'] as String?,
    description: json['description'] as String?,
  );
}

class NavigationInstruction {
  const NavigationInstruction({required this.type, required this.text, required this.distanceMeters, required this.coordinate});
  final String type;
  final String text;
  final double distanceMeters;
  final CampusCoordinate coordinate;

  factory NavigationInstruction.fromJson(CampusJsonMap json) => NavigationInstruction(
    type: json['type'] as String,
    text: json['text'] as String,
    distanceMeters: (json['distanceMeters'] as num).toDouble(),
    coordinate: CampusCoordinate.fromPair(json['coordinate'] as List<dynamic>),
  );
}

class NavigationRoute {
  const NavigationRoute({required this.id, required this.profile, required this.distanceMeters, required this.durationSeconds, required this.coordinates, required this.instructions});
  final String id;
  final String profile;
  final double distanceMeters;
  final double durationSeconds;
  final List<CampusCoordinate> coordinates;
  final List<NavigationInstruction> instructions;

  factory NavigationRoute.fromJson(CampusJsonMap json) => NavigationRoute(
    id: json['id'] as String,
    profile: json['profile'] as String,
    distanceMeters: (json['distanceMeters'] as num).toDouble(),
    durationSeconds: (json['durationSeconds'] as num).toDouble(),
    coordinates: (json['coordinates'] as List<dynamic>).map((item) => CampusCoordinate.fromPair(item as List<dynamic>)).toList(growable: false),
    instructions: (json['instructions'] as List<dynamic>).map((item) => NavigationInstruction.fromJson(item as CampusJsonMap)).toList(growable: false),
  );
}

class Pin {
  const Pin({required this.id, required this.creatorId, required this.type, required this.title, required this.longitude, required this.latitude, required this.status, required this.visibility, required this.version, required this.createdAt, required this.updatedAt, this.roomId, this.description, this.expiresAt});
  final String id;
  final String? roomId;
  final String creatorId;
  final String type;
  final String title;
  final String? description;
  final double longitude;
  final double latitude;
  final String status;
  final String visibility;
  final int version;
  final DateTime? expiresAt;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory Pin.fromJson(CampusJsonMap json) => Pin(
    id: json['id'] as String,
    roomId: json['roomId'] as String?,
    creatorId: json['creatorId'] as String,
    type: json['type'] as String,
    title: json['title'] as String,
    description: json['description'] as String?,
    longitude: (json['longitude'] as num).toDouble(),
    latitude: (json['latitude'] as num).toDouble(),
    status: json['status'] as String,
    visibility: json['visibility'] as String,
    version: json['version'] as int,
    expiresAt: json['expiresAt'] == null ? null : DateTime.parse(json['expiresAt'] as String),
    createdAt: DateTime.parse(json['createdAt'] as String),
    updatedAt: DateTime.parse(json['updatedAt'] as String),
  );
}
`;

const barrel = `// GENERATED FILE. Run: pnpm contracts:generate
export 'campus_models.dart';
export 'realtime_models.dart' hide JsonMap;
export 'twin_models.dart' hide JsonMap;
`;

const realtimeModels = await readFile(resolve(contractRoot, 'generated', 'realtime_models.dart'), 'utf8');
const twinModels = await readFile(resolve(contractRoot, 'generated', 'twin_models.dart'), 'utf8');
const outputs = new Map<string, string>([
  [resolve(flutterContractRoot, 'realtime_models.dart'), realtimeModels],
  [resolve(flutterContractRoot, 'twin_models.dart'), twinModels],
  [resolve(flutterContractRoot, 'campus_models.dart'), campusModels],
  [resolve(flutterContractRoot, 'contracts.dart'), barrel],
]);

for (const [path, content] of outputs) {
  if (checkOnly) {
    const existing = await readFile(path, 'utf8').catch(() => '');
    if (existing !== content) throw new Error(`Generated Flutter contract is stale: ${path}`);
    continue;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}
