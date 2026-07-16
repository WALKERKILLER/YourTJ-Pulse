import type { RealtimeMember } from '@yourtj/contracts';
import type { FeatureCollection, Point } from 'geojson';
import type { LayerSpecification } from 'maplibre-gl';
import { useMemo } from 'react';

import { MapGeoJSON, MapMarker, MarkerContent } from '../../components/map/map';

const MARKER_LIMIT = 12;

function initials(name: string): string {
  return [...name.trim()].slice(0, 2).join('').toUpperCase() || '?';
}

function updatedLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export function RealtimeMemberLayer({ members }: { members: RealtimeMember[] }) {
  const visibleMembers = members.filter((member) => member.sharingLocation && member.location && member.connectionStatus !== 'offline');
  const data = useMemo<FeatureCollection<Point>>(() => ({
    type: 'FeatureCollection',
    features: visibleMembers.map((member) => ({
      type: 'Feature',
      id: member.userId,
      properties: { initials: initials(member.displayName), name: member.displayName, status: member.connectionStatus, updatedLabel: updatedLabel(member.updatedAt) },
      geometry: { type: 'Point', coordinates: [member.location!.longitude, member.location!.latitude] },
    })),
  }), [visibleMembers]);
  const layers = useMemo<LayerSpecification[]>(() => [
    {
      id: 'realtime-members-halo', type: 'circle', source: 'realtime-members',
      paint: {
        'circle-radius': ['match', ['get', 'status'], 'live', 18, 'delayed', 16, 14],
        'circle-color': ['match', ['get', 'status'], 'live', '#4ec7a7', 'delayed', '#d6a84e', '#84908a'],
        'circle-opacity': ['match', ['get', 'status'], 'stale', 0.2, 0.32],
      },
    },
    {
      id: 'realtime-members-symbol', type: 'symbol', source: 'realtime-members',
      layout: { 'text-field': ['format', ['get', 'initials'], {}, '\n', {}, ['get', 'updatedLabel'], { 'font-scale': 0.65 }], 'text-size': 11, 'text-font': ['Open Sans Bold'] },
      paint: { 'text-color': '#ffffff', 'text-halo-color': '#1d2a25', 'text-halo-width': 1 },
    },
  ], []);

  if (visibleMembers.length > MARKER_LIMIT) return <MapGeoJSON id="realtime-members" data={data} layers={layers} />;
  return visibleMembers.map((member) => (
    <MapMarker key={member.userId} longitude={member.location!.longitude} latitude={member.location!.latitude}>
      <MarkerContent className={`realtime-member-marker is-${member.connectionStatus}`}>
        <span aria-hidden="true">{initials(member.displayName)}</span>
        <small>{member.displayName}{member.connectionStatus === 'stale' ? ` · ${updatedLabel(member.updatedAt)}` : ''}</small>
      </MarkerContent>
    </MapMarker>
  ));
}
