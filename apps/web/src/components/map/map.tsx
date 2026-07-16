/*
 * Adapted from Mapcn by Anmol Saini (MIT License).
 * Source: https://github.com/AnmolSaini16/mapcn
 * Components remain local so campus-specific behavior can evolve with the product.
 */
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry, LineString, Point } from 'geojson';
import maplibregl, {
  type GeoJSONSource,
  type LngLatLike,
  type MapLayerMouseEvent,
  type MapOptions,
  type StyleSpecification,
} from 'maplibre-gl';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Compass, LocateFixed, Minus, Plus } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

const MapContext = createContext<maplibregl.Map | null>(null);

export function useMap(): maplibregl.Map {
  const map = useContext(MapContext);
  if (!map) throw new Error('Map components must be rendered inside <Map>.');
  return map;
}

interface MapProps {
  children?: ReactNode;
  className?: string;
  initialViewState?: Partial<Pick<MapOptions, 'center' | 'zoom' | 'pitch' | 'bearing' | 'maxBounds'>>;
  mapStyle: StyleSpecification;
  onClick?: (event: MapLayerMouseEvent) => void;
  onError?: (error: Error) => void;
  onLoad?: (map: maplibregl.Map) => void;
}

export function Map({ children, className, initialViewState, mapStyle, onClick, onError, onLoad }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const lastStyleRef = useRef(mapStyle);
  const onClickRef = useRef(onClick);
  const onErrorRef = useRef(onError);
  const onLoadRef = useRef(onLoad);
  const [ready, setReady] = useState(false);

  onClickRef.current = onClick;
  onErrorRef.current = onError;
  onLoadRef.current = onLoad;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const options: MapOptions = {
      container: containerRef.current,
      style: mapStyle,
      center: initialViewState?.center ?? [121.5012, 31.2825],
      zoom: initialViewState?.zoom ?? 15.5,
      pitch: initialViewState?.pitch ?? 42,
      bearing: initialViewState?.bearing ?? -8,
      attributionControl: false,
    };
    if (initialViewState?.maxBounds) options.maxBounds = initialViewState.maxBounds;

    const map = new maplibregl.Map(options);
    mapRef.current = map;
    map.on('load', () => {
      setReady(true);
      onLoadRef.current?.(map);
    });
    map.on('click', (event) => onClickRef.current?.(event));
    map.on('error', (event) => onErrorRef.current?.(event.error));

    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || lastStyleRef.current === mapStyle) return;
    lastStyleRef.current = mapStyle;
    map.setStyle(mapStyle, { diff: true });
  }, [mapStyle, ready]);

  return (
    <MapContext.Provider value={ready ? mapRef.current : null}>
      <div ref={containerRef} className={cn('relative size-full overflow-hidden', className)} />
      {ready ? children : null}
    </MapContext.Provider>
  );
}

interface MapControlsProps {
  className?: string;
  onLocate?: (position: { accuracy: number; latitude: number; longitude: number }) => void;
  onThemeToggle?: () => void;
}

export function MapControls({ className, onLocate, onThemeToggle }: MapControlsProps) {
  const map = useMap();

  function locate(): void {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      map.flyTo({ center: [coords.longitude, coords.latitude], zoom: 17, essential: true });
      onLocate?.({ longitude: coords.longitude, latitude: coords.latitude, accuracy: coords.accuracy });
    });
  }

  return createPortal(
    <div className={cn('map-controls', className)} aria-label="地图控制">
      <Button size="icon" variant="secondary" aria-label="放大地图" onClick={() => map.zoomIn()}><Plus size={18} /></Button>
      <Button size="icon" variant="secondary" aria-label="缩小地图" onClick={() => map.zoomOut()}><Minus size={18} /></Button>
      <Button size="icon" variant="secondary" aria-label="定位到当前位置" onClick={locate}><LocateFixed size={18} /></Button>
      {onThemeToggle ? <Button size="icon" variant="secondary" aria-label="切换地图主题" onClick={onThemeToggle}><Compass size={18} /></Button> : null}
    </div>,
    map.getContainer().parentElement ?? map.getContainer(),
  );
}

interface MapMarkerProps {
  children: ReactNode;
  className?: string;
  draggable?: boolean;
  longitude: number;
  latitude: number;
  onDragEnd?: (coordinates: { longitude: number; latitude: number }) => void;
}

export function MapMarker({ children, className, draggable = false, latitude, longitude, onDragEnd }: MapMarkerProps) {
  const map = useMap();
  const element = useMemo(() => document.createElement('div'), []);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    element.className = cn('map-marker', className);
  }, [className, element]);

  useEffect(() => {
    const marker = new maplibregl.Marker({ element, draggable }).setLngLat([longitude, latitude]).addTo(map);
    markerRef.current = marker;
    marker.on('dragend', () => {
      const point = marker.getLngLat();
      onDragEnd?.({ longitude: point.lng, latitude: point.lat });
    });
    return () => {
      marker.remove();
      markerRef.current = null;
    };
  }, [draggable, element, map, onDragEnd]);

  useEffect(() => {
    markerRef.current?.setLngLat([longitude, latitude]);
  }, [latitude, longitude]);

  return createPortal(children, element);
}

export function MarkerContent({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <div className={cn('map-marker-content', className)} style={style}>{children}</div>;
}

interface MarkerPopupProps {
  children: ReactNode;
  closeButton?: boolean;
  latitude: number;
  longitude: number;
  onClose?: () => void;
}

export function MarkerPopup({ children, closeButton = false, latitude, longitude, onClose }: MarkerPopupProps) {
  const map = useMap();
  const element = useMemo(() => document.createElement('div'), []);

  useEffect(() => {
    const popup = new maplibregl.Popup({ closeButton, closeOnClick: false, offset: 18 })
      .setDOMContent(element)
      .setLngLat([longitude, latitude])
      .addTo(map);
    popup.on('close', () => onClose?.());
    return () => {
      popup.remove();
    };
  }, [closeButton, element, latitude, longitude, map, onClose]);

  return createPortal(children, element);
}

interface MapGeoJSONProps<G extends Geometry = Geometry> {
  data: Feature<G> | FeatureCollection<G>;
  id: string;
  layers: maplibregl.LayerSpecification[];
}

export function MapGeoJSON<G extends Geometry = Geometry>({ data, id, layers }: MapGeoJSONProps<G>) {
  const map = useMap();
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    let restoring = false;
    const ensureResources = (): void => {
      if (restoring || !map.isStyleLoaded()) return;
      restoring = true;
      try {
        if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: dataRef.current });
        for (const layer of layers) {
          if (!map.getLayer(layer.id)) map.addLayer({ ...layer, source: id } as maplibregl.LayerSpecification);
        }
      } finally {
        restoring = false;
      }
    };
    ensureResources();
    map.on('styledata', ensureResources);
    return () => {
      map.off('styledata', ensureResources);
      for (const layer of [...layers].reverse()) if (map.getLayer(layer.id)) map.removeLayer(layer.id);
      if (map.getSource(id)) map.removeSource(id);
    };
  }, [id, layers, map]);

  useEffect(() => {
    (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
  }, [data, id, map]);

  return null;
}

interface MapRouteProps {
  coordinates: [number, number][];
  color?: string;
  id?: string;
  width?: number;
}

export function MapRoute({ color = '#e24b74', coordinates, id = 'campus-route', width = 5 }: MapRouteProps) {
  const data = useMemo<Feature<LineString>>(() => ({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates },
  }), [coordinates]);
  const layers = useMemo<maplibregl.LayerSpecification[]>(() => [{
    id,
    type: 'line',
    source: id,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': color, 'line-width': width, 'line-opacity': 0.9 },
  }], [color, id, width]);
  return <MapGeoJSON id={id} data={data} layers={layers} />;
}

interface MapClusterLayerProps {
  data: FeatureCollection<Point, GeoJsonProperties>;
  id?: string;
}

export function MapClusterLayer({ data, id = 'campus-clusters' }: MapClusterLayerProps) {
  const map = useMap();
  const dataRef = useRef(data);
  dataRef.current = data;
  const layers = useMemo<maplibregl.LayerSpecification[]>(() => [
    {
      id: `${id}-bubbles`, type: 'circle', source: id, filter: ['has', 'point_count'],
      paint: { 'circle-color': '#2455d6', 'circle-radius': ['step', ['get', 'point_count'], 16, 20, 22, 60, 28], 'circle-opacity': 0.88 },
    },
    {
      id: `${id}-count`, type: 'symbol', source: id, filter: ['has', 'point_count'],
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
      paint: { 'text-color': '#ffffff' },
    },
    {
      id: `${id}-point`, type: 'circle', source: id, filter: ['!', ['has', 'point_count']],
      paint: { 'circle-color': '#e24b74', 'circle-radius': 6, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 },
    },
  ], [id]);

  useEffect(() => {
    let restoring = false;
    const ensureResources = (): void => {
      if (restoring || !map.isStyleLoaded()) return;
      restoring = true;
      try {
        if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: dataRef.current, cluster: true, clusterMaxZoom: 16, clusterRadius: 44 });
        for (const layer of layers) if (!map.getLayer(layer.id)) map.addLayer(layer);
      } finally {
        restoring = false;
      }
    };
    ensureResources();
    map.on('styledata', ensureResources);
    return () => {
      map.off('styledata', ensureResources);
      for (const layer of [...layers].reverse()) if (map.getLayer(layer.id)) map.removeLayer(layer.id);
      if (map.getSource(id)) map.removeSource(id);
    };
  }, [id, layers, map]);

  useEffect(() => {
    (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
  }, [data, id, map]);

  return null;
}

export function lngLat(value: [number, number]): LngLatLike {
  return value;
}
