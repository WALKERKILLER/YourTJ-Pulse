import { createCampusStyle, INTERACTIVE_LAYER_IDS } from '@yourtj/campus-style';
import { evaluateRouteProgress, nextRouteInstruction, searchCampusPlaces, type CampusRoute, type SearchDocument, type SearchIndex } from '@yourtj/campus-navigation';
import type { Map as MapLibreMap, MapLayerMouseEvent } from 'maplibre-gl';
import {
  ArrowRight,
  Building2,
  ChevronDown,
  CircleHelp,
  LocateFixed,
  MapPinned,
  MapPin,
  Menu,
  Navigation,
  PencilLine,
  Search,
  ShieldCheck,
  WifiOff,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import searchIndexData from '../../../../../data/generated/search-index.json';
import worldConfig from '../../../../../data/generated/world-config.json';
import { Map, MapControls, MapMarker, MapRoute, MarkerContent } from '../../components/map/map';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Skeleton } from '../../components/ui/skeleton';
import { registerPmtilesProtocol } from '../../lib/pmtiles';
import { featureIdentity } from '../../lib/utils';
import { useMapStore } from '../../stores/map-store';
import { useNavigationStore, type NavigationEndpoint } from '../../stores/navigation-store';
import { usePreferencesStore } from '../../stores/preferences-store';
import { requestCampusRoutes } from './navigation-client';
import { NavigationPanel } from './navigation-panel';
import { RealtimeMemberLayer } from '../realtime/realtime-member-layer';
import { RoomSharingPanel } from '../realtime/room-sharing-panel';
import { useRoomRealtime } from '../realtime/use-room-realtime';

const SEARCH_INDEX = searchIndexData as SearchIndex;

registerPmtilesProtocol();

function endpointForPlace(place: SearchDocument): NavigationEndpoint {
  return { placeId: place.id, name: place.name, longitude: place.longitude, latitude: place.latitude };
}

function locateOnce(): Promise<{ accuracy: number; latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('当前浏览器不支持定位'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ longitude: coords.longitude, latitude: coords.latitude, accuracy: coords.accuracy }),
      () => reject(new Error('无法读取当前位置，请检查定位权限')),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 12_000 },
    );
  });
}

function Brand() {
  return (
    <Link to="/" className="brand-lockup" aria-label="YourTJ Pulse 首页">
      <span className="brand-mark"><MapPinned size={20} /></span>
      <span><strong>YourTJ</strong><small>Pulse · CAMPUS MAP</small></span>
    </Link>
  );
}

function SearchPanel({ onSelect }: { onSelect: (place: SearchDocument) => void }) {
  const [query, setQuery] = useState('');
  const searchOpen = useMapStore((state) => state.searchOpen);
  const setSearchOpen = useMapStore((state) => state.setSearchOpen);
  const results = searchCampusPlaces(SEARCH_INDEX, query);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
        document.querySelector<HTMLInputElement>('[aria-label="搜索地点"]')?.focus();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [setSearchOpen]);

  return (
    <section className={`search-panel ${searchOpen ? 'is-open' : ''}`} aria-label="地点搜索">
      <div className="search-input-wrap">
        <Search size={18} aria-hidden="true" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setSearchOpen(true)}
          placeholder="搜索教学楼、食堂、入口…"
          aria-label="搜索地点"
        />
        {searchOpen ? <button className="search-close" onClick={() => setSearchOpen(false)} aria-label="关闭搜索"><X size={16} /></button> : <kbd>⌘ K</kbd>}
      </div>
      {searchOpen ? (
        <div className="search-results" role="listbox">
          <p className="eyebrow">{query ? `${results.length} 个匹配地点` : '校园地点'}</p>
          {results.length ? results.map((place) => (
            <button key={place.id} className="search-result" role="option" aria-selected="false" onClick={() => { onSelect(place); setSearchOpen(false); }}>
              <span className="result-icon"><Building2 size={17} /></span>
              <span><strong>{place.name}</strong><small>{place.aliases[0] ?? place.description ?? place.pinyin}</small></span>
              <span className="result-kind">{place.category}</span>
            </button>
          )) : (
            <div className="empty-state"><Search size={22} /><strong>没有匹配地点</strong><span>试试建筑名称或设施类别。</span></div>
          )}
          <p className="search-note">离线索引支持名称、拼音、英文、编号、类别与功能描述。</p>
        </div>
      ) : null}
    </section>
  );
}

function PlaceDetails({ onNavigate }: { onNavigate: (place: SearchDocument) => void }) {
  const navigate = useNavigate();
  const { placeId, roomId } = useParams();
  const selected = useMapStore((state) => state.selectedPlace);
  const clearSelection = useMapStore((state) => state.setSelectedFeature);
  const detailsOpen = useMapStore((state) => state.detailsOpen);
  const properties = selected?.properties;
  const stableId = selected ? featureIdentity(selected.properties, selected.feature.id) : placeId;
  const catalogPlace = SEARCH_INDEX.documents.find((place) => place.id === stableId);

  if (!detailsOpen && !catalogPlace && !roomId) {
    return (
      <div className="detail-empty">
        <span className="detail-illustration"><MapPinned size={30} /></span>
        <strong>校园脉络，轻轻一点</strong>
        <p>选择建筑或地点，查看开放时间、入口与无障碍信息。</p>
      </div>
    );
  }

  const close = (): void => {
    clearSelection(null);
    navigate('/');
  };

  if (roomId && !selected && !catalogPlace) {
    return (
      <article className="place-detail">
        <div className="detail-heading">
          <div><p className="eyebrow">协作房间</p><h1>房间 {roomId}</h1></div>
          <Button size="icon" variant="ghost" onClick={close} aria-label="离开房间视图"><X size={18} /></Button>
        </div>
        <div className="place-meta"><span>实时成员</span><span>端到端临时位置</span></div>
        <dl className="property-list">
          <div><dt>位置共享</dt><dd>默认关闭；请使用地图左下角面板主动开始。</dd></div>
          <div><dt>可见范围</dt><dd>仅当前房间成员，不保存永久 GPS 轨迹。</dd></div>
          <div><dt>断线恢复</dt><dd>网络恢复后自动重连，并重新获取房间快照。</dd></div>
        </dl>
      </article>
    );
  }

  return (
    <article className="place-detail">
      <div className="detail-heading">
        <div>
          <p className="eyebrow">{roomId ? '协作房间' : selected?.layerId.includes('building') ? '校园建筑' : '校园地点'}</p>
          <h1>{selected?.name ?? catalogPlace?.name ?? (roomId ? `房间 ${roomId}` : `地点 ${placeId}`)}</h1>
        </div>
        <Button size="icon" variant="ghost" onClick={close} aria-label="关闭详情"><X size={18} /></Button>
      </div>
      {selected || catalogPlace ? (
        <>
          <div className="place-meta">
            <span>{String(properties?.amenity ?? properties?.building ?? catalogPlace?.category ?? '校园设施')}</span>
            <span>{String(properties?.opening_hours ?? '开放时间待完善')}</span>
          </div>
          <dl className="property-list">
            <div><dt>入口</dt><dd>{String(properties?.entrance ?? '地图选择建筑主入口')}</dd></div>
            <div><dt>无障碍</dt><dd>{properties?.wheelchair === 'yes' ? '支持无障碍通行' : '信息待核实'}</dd></div>
            <div><dt>数据来源</dt><dd>OpenStreetMap · {String(properties?.id ?? 'campus feature')}</dd></div>
          </dl>
          <div className="detail-actions">
            <Button disabled={!catalogPlace} onClick={() => catalogPlace && onNavigate(catalogPlace)}><Navigation size={17} />到这里</Button>
            <Button variant="secondary" onClick={() => navigate('/editor')}><PencilLine size={17} />纠错</Button>
          </div>
        </>
      ) : (
        <div className="loading-detail" aria-live="polite">
          <Skeleton className="h-16 w-full" />
          <p>从地图重新选择该地点以加载本地详情。</p>
        </div>
      )}
    </article>
  );
}

interface DetailContentProps {
  onNavigate: (place: SearchDocument) => void;
  onOverview: () => void;
  onPlan: () => void;
  onShare: () => void;
  onStartFollowing: () => void;
}

function DetailContent(props: DetailContentProps) {
  const destination = useNavigationStore((state) => state.destination);
  return destination ? <NavigationPanel onOverview={props.onOverview} onPlan={props.onPlan} onShare={props.onShare} onStartFollowing={props.onStartFollowing} /> : <PlaceDetails onNavigate={props.onNavigate} />;
}

function MobileSheet(props: DetailContentProps) {
  const sheetHeight = useMapStore((state) => state.sheetHeight);
  const setSheetHeight = useMapStore((state) => state.setSheetHeight);

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>): void {
    event.currentTarget.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const startHeight = sheetHeight;
    const target = event.currentTarget;
    const move = (pointerEvent: PointerEvent): void => {
      setSheetHeight(Math.min(window.innerHeight * 0.78, Math.max(116, startHeight + startY - pointerEvent.clientY)));
    };
    const stop = (): void => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', stop);
      target.removeEventListener('pointercancel', stop);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', stop);
    target.addEventListener('pointercancel', stop);
  }

  return (
    <aside className="mobile-sheet" style={{ height: sheetHeight }}>
      <button className="sheet-handle" onPointerDown={beginDrag} onClick={() => setSheetHeight(sheetHeight < 300 ? 480 : 160)} aria-label="拖动或展开地点详情">
        <span />
        <ChevronDown size={15} />
      </button>
      <DetailContent {...props} />
    </aside>
  );
}

export function MapShell() {
  const { roomId } = useParams();
  const realtime = useRoomRealtime(roomId);
  const navigate = useNavigate();
  const theme = usePreferencesStore((state) => state.theme);
  const toggleTheme = usePreferencesStore((state) => state.toggleTheme);
  const setSelectedFeature = useMapStore((state) => state.setSelectedFeature);
  const sheetHeight = useMapStore((state) => state.sheetHeight);
  const destination = useNavigationStore((state) => state.destination);
  const setDestination = useNavigationStore((state) => state.setDestination);
  const setOrigin = useNavigationStore((state) => state.setOrigin);
  const profile = useNavigationStore((state) => state.profile);
  const setProfile = useNavigationStore((state) => state.setProfile);
  const routes = useNavigationStore((state) => state.routes);
  const setRoutes = useNavigationStore((state) => state.setRoutes);
  const activeRouteIndex = useNavigationStore((state) => state.activeRouteIndex);
  const status = useNavigationStore((state) => state.status);
  const setStatus = useNavigationStore((state) => state.setStatus);
  const setMessage = useNavigationStore((state) => state.setMessage);
  const currentPosition = useNavigationStore((state) => state.currentPosition);
  const setCurrentPosition = useNavigationStore((state) => state.setCurrentPosition);
  const selectingDestination = useNavigationStore((state) => state.selectingDestination);
  const setSelectingDestination = useNavigationStore((state) => state.setSelectingDestination);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);
  const mapStyle = useMemo(() => createCampusStyle(theme), [theme]);
  const activeRoute = routes[activeRouteIndex];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const sharedPlace = parameters.get('to');
    const sharedProfile = parameters.get('profile');
    if (sharedProfile === 'walking' || sharedProfile === 'cycling' || sharedProfile === 'wheelchair') setProfile(sharedProfile);
    if (sharedPlace) {
      const place = SEARCH_INDEX.documents.find((candidate) => candidate.id === sharedPlace);
      if (place) setDestination(endpointForPlace(place));
      return;
    }
    const longitude = Number(parameters.get('lng'));
    const latitude = Number(parameters.get('lat'));
    if (Number.isFinite(longitude) && Number.isFinite(latitude) && parameters.has('lng') && parameters.has('lat')) setDestination({ name: '分享的地图选点', longitude, latitude });
  }, [setDestination, setProfile]);

  useEffect(() => {
    if (status !== 'following' || !activeRoute || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(({ coords }) => {
      const position = { longitude: coords.longitude, latitude: coords.latitude, accuracy: coords.accuracy };
      setCurrentPosition(position);
      const progress = evaluateRouteProgress(activeRoute, position);
      if (progress.arrived) {
        setMessage('已抵达目的地');
        setStatus('arrived');
      } else if (progress.offRoute) {
        setMessage(`已偏离路线约 ${Math.round(progress.distanceToRouteMeters)} 米，请返回路线或重新规划`);
      } else {
        setMessage(nextRouteInstruction(activeRoute, position)?.text ?? '沿路线继续前进');
      }
      mapInstance?.easeTo({ center: [position.longitude, position.latitude], zoom: 18, duration: 500 });
    }, () => setMessage('定位暂时中断，路线仍可查看'), { enableHighAccuracy: true, maximumAge: 3_000, timeout: 15_000 });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [activeRoute, mapInstance, setCurrentPosition, setMessage, setStatus, status]);

  function overviewRoute(route: CampusRoute | undefined = activeRoute): void {
    if (!route || !mapInstance || route.coordinates.length === 0) return;
    const longitudes = route.coordinates.map(([longitude]) => longitude);
    const latitudes = route.coordinates.map(([, latitude]) => latitude);
    mapInstance.fitBounds([[Math.min(...longitudes), Math.min(...latitudes)], [Math.max(...longitudes), Math.max(...latitudes)]], { padding: 90, duration: 650 });
  }

  async function planRoute(): Promise<void> {
    if (!destination) return;
    setStatus('routing');
    setMessage(null);
    try {
      const position = currentPosition ?? await locateOnce();
      setCurrentPosition(position);
      const nextOrigin: NavigationEndpoint = { name: '我的位置', longitude: position.longitude, latitude: position.latitude };
      setOrigin(nextOrigin);
      const calculated = await requestCampusRoutes({
        origin: { longitude: nextOrigin.longitude, latitude: nextOrigin.latitude },
        destination: destination.placeId ? { placeId: destination.placeId } : { longitude: destination.longitude, latitude: destination.latitude },
        profile,
      });
      if (!calculated.length) throw new Error('当前起终点之间没有可用路线');
      setRoutes(calculated);
      setMessage(calculated[0]?.instructions[0]?.text ?? null);
      overviewRoute(calculated[0]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '路线规划失败');
      setStatus('error');
    }
  }

  function selectCatalogPlace(place: SearchDocument): void {
    setDestination(endpointForPlace(place));
    setSelectedFeature(null);
    mapInstance?.flyTo({ center: [place.longitude, place.latitude], zoom: 17, essential: true });
    navigate(`/place/${encodeURIComponent(place.id)}`);
  }

  async function shareRoute(): Promise<void> {
    if (!destination) return;
    const url = new URL(window.location.href);
    url.pathname = destination.placeId ? `/place/${encodeURIComponent(destination.placeId)}` : '/';
    url.search = '';
    if (destination.placeId) url.searchParams.set('to', destination.placeId);
    else {
      url.searchParams.set('lng', String(destination.longitude));
      url.searchParams.set('lat', String(destination.latitude));
    }
    url.searchParams.set('profile', profile);
    try {
      const canShare = typeof navigator.share === 'function';
      if (canShare) await navigator.share({ title: `前往 ${destination.name}`, url: url.toString() });
      else await navigator.clipboard.writeText(url.toString());
      setMessage(canShare ? '路线已分享' : '路线链接已复制');
    } catch {
      setMessage('未完成分享，路线仍保留在当前页面');
    }
  }

  function selectFeature(event: MapLayerMouseEvent): void {
    if (selectingDestination) {
      setDestination({ name: '地图选点', longitude: event.lngLat.lng, latitude: event.lngLat.lat });
      setSelectingDestination(false);
      setSelectedFeature(null);
      navigate('/');
      return;
    }
    const layers = INTERACTIVE_LAYER_IDS.filter((id) => event.target.getLayer(id));
    const [feature] = event.target.queryRenderedFeatures(event.point, { layers: [...layers] });
    setSelectedFeature(feature ?? null);
    if (feature) {
      const id = featureIdentity(feature.properties, feature.id);
      navigate(`/place/${encodeURIComponent(id)}`);
    }
  }

  return (
    <main className="map-app" style={{ '--sheet-height': `${sheetHeight}px` } as CSSProperties}>
      <div className="map-stage" aria-label="同济大学校园地图">
        <Map
          mapStyle={mapStyle}
          initialViewState={{
            center: [worldConfig.origin.longitude, worldConfig.origin.latitude],
            zoom: 15.5,
            pitch: 42,
            bearing: -8,
            maxBounds: [[worldConfig.bounds.west, worldConfig.bounds.south], [worldConfig.bounds.east, worldConfig.bounds.north]],
          }}
          onClick={selectFeature}
          onError={() => setMapError(true)}
          onLoad={(map) => { setMapInstance(map); setMapReady(true); }}
        >
          <MapControls onThemeToggle={toggleTheme} onLocate={(position) => setCurrentPosition(position)} />
          {routes.map((route, index) => <MapRoute key={route.id} id={`campus-route-${index}`} coordinates={route.coordinates} color={index === activeRouteIndex ? '#e24b74' : '#7187b8'} width={index === activeRouteIndex ? 6 : 3} />)}
          {roomId ? <RealtimeMemberLayer members={realtime.members} /> : null}
          {currentPosition ? <MapMarker longitude={currentPosition.longitude} latitude={currentPosition.latitude}><MarkerContent className="current-position-marker"><LocateFixed size={16} /></MarkerContent></MapMarker> : null}
          {destination ? <MapMarker longitude={destination.longitude} latitude={destination.latitude}><MarkerContent className="destination-marker"><MapPin size={17} /></MarkerContent></MapMarker> : null}
        </Map>
        {!mapReady ? <div className="map-loading"><span className="pulse-ring" /><strong>正在铺开校园地图</strong><small>加载离线矢量图层…</small></div> : null}
        {mapReady && mapError ? <div className="map-error" role="alert"><WifiOff size={16} /><span><strong>地图数据暂时不可用</strong><small>界面仍可浏览，请稍后重试。</small></span><button onClick={() => window.location.reload()}>重试</button></div> : null}
      </div>

      <header className="topbar">
        <Brand />
        <SearchPanel onSelect={selectCatalogPlace} />
        <nav className="top-actions" aria-label="主要导航">
          <Link to="/editor" className="nav-link"><PencilLine size={16} />地图纠错</Link>
          <Button size="icon" variant="secondary" aria-label="打开菜单"><Menu size={18} /></Button>
        </nav>
      </header>

      <nav className="map-toolbar" aria-label="地图工具">
        <Link to="/" className="tool-link is-active"><MapPinned size={18} /><span>地图</span></Link>
        <Link to="/pulsetown" className="tool-link"><Building2 size={18} /><span>城镇</span></Link>
        <Link to="/settings/privacy" className="tool-link"><ShieldCheck size={18} /><span>隐私</span></Link>
        <button className={`tool-link ${selectingDestination ? 'is-active' : ''}`} onClick={() => setSelectingDestination(!selectingDestination)} aria-pressed={selectingDestination}><MapPin size={18} /><span>选点</span></button>
        <a href="https://github.com/WALKERKILLER/YourTJ-Pulse" target="_blank" rel="noreferrer" className="tool-link"><CircleHelp size={18} /><span>关于</span></a>
      </nav>

      {roomId ? <RoomSharingPanel roomId={roomId} realtime={realtime} /> : null}

      <aside className="detail-panel"><DetailContent onNavigate={selectCatalogPlace} onOverview={() => overviewRoute()} onPlan={() => void planRoute()} onShare={() => void shareRoute()} onStartFollowing={() => { setStatus('following'); setMessage(activeRoute?.instructions[0]?.text ?? '开始导航'); }} /></aside>
      <MobileSheet onNavigate={selectCatalogPlace} onOverview={() => overviewRoute()} onPlan={() => void planRoute()} onShare={() => void shareRoute()} onStartFollowing={() => { setStatus('following'); setMessage(activeRoute?.instructions[0]?.text ?? '开始导航'); }} />

      <div className="map-attribution">
        <span>© OpenStreetMap</span><span>YOURTJ · 2026</span><ArrowRight size={13} />
      </div>
    </main>
  );
}
