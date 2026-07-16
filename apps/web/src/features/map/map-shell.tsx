import { createCampusStyle, INTERACTIVE_LAYER_IDS } from '@yourtj/campus-style';
import type { MapLayerMouseEvent } from 'maplibre-gl';
import {
  ArrowRight,
  Building2,
  ChevronDown,
  CircleHelp,
  MapPinned,
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
import worldConfig from '../../../../../data/generated/world-config.json';
import { Map, MapControls } from '../../components/map/map';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Skeleton } from '../../components/ui/skeleton';
import { registerPmtilesProtocol } from '../../lib/pmtiles';
import { featureIdentity } from '../../lib/utils';
import { useMapStore } from '../../stores/map-store';
import { usePreferencesStore } from '../../stores/preferences-store';

const QUICK_PLACES = [
  { name: '同济大学图书馆', kind: '学习', hint: '四平路校区 · 07:30—22:30' },
  { name: '129 礼堂', kind: '活动', hint: '校园西北侧 · 文化场馆' },
  { name: '瑞安楼', kind: '教学', hint: '四平路校区 · 教学楼' },
];

registerPmtilesProtocol();

function Brand() {
  return (
    <Link to="/" className="brand-lockup" aria-label="YourTJ Pulse 首页">
      <span className="brand-mark"><MapPinned size={20} /></span>
      <span><strong>YourTJ</strong><small>Pulse · CAMPUS MAP</small></span>
    </Link>
  );
}

function SearchPanel() {
  const [query, setQuery] = useState('');
  const searchOpen = useMapStore((state) => state.searchOpen);
  const setSearchOpen = useMapStore((state) => state.setSearchOpen);
  const results = QUICK_PLACES.filter(({ name, kind }) => `${name}${kind}`.toLowerCase().includes(query.toLowerCase()));

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
          <p className="eyebrow">{query ? `${results.length} 个匹配地点` : '常用地点'}</p>
          {results.length ? results.map((place) => (
            <button key={place.name} className="search-result" role="option" aria-selected="false">
              <span className="result-icon"><Building2 size={17} /></span>
              <span><strong>{place.name}</strong><small>{place.hint}</small></span>
              <span className="result-kind">{place.kind}</span>
            </button>
          )) : (
            <div className="empty-state"><Search size={22} /><strong>没有匹配地点</strong><span>试试建筑名称或设施类别。</span></div>
          )}
          <p className="search-note">完整离线索引将在下一阶段接入；当前可点击地图浏览。</p>
        </div>
      ) : null}
    </section>
  );
}

function PlaceDetails() {
  const navigate = useNavigate();
  const { placeId, roomId } = useParams();
  const selected = useMapStore((state) => state.selectedPlace);
  const clearSelection = useMapStore((state) => state.setSelectedFeature);
  const detailsOpen = useMapStore((state) => state.detailsOpen);
  const properties = selected?.properties;

  if (!detailsOpen && !placeId && !roomId) {
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

  return (
    <article className="place-detail">
      <div className="detail-heading">
        <div>
          <p className="eyebrow">{roomId ? '协作房间' : selected?.layerId.includes('building') ? '校园建筑' : '校园地点'}</p>
          <h1>{selected?.name ?? (roomId ? `房间 ${roomId}` : `地点 ${placeId}`)}</h1>
        </div>
        <Button size="icon" variant="ghost" onClick={close} aria-label="关闭详情"><X size={18} /></Button>
      </div>
      {selected ? (
        <>
          <div className="place-meta">
            <span>{String(properties?.amenity ?? properties?.building ?? '校园设施')}</span>
            <span>{String(properties?.opening_hours ?? '开放时间待完善')}</span>
          </div>
          <dl className="property-list">
            <div><dt>入口</dt><dd>{String(properties?.entrance ?? '地图选择建筑主入口')}</dd></div>
            <div><dt>无障碍</dt><dd>{properties?.wheelchair === 'yes' ? '支持无障碍通行' : '信息待核实'}</dd></div>
            <div><dt>数据来源</dt><dd>OpenStreetMap · {String(properties?.id ?? 'campus feature')}</dd></div>
          </dl>
          <div className="detail-actions">
            <Button><Navigation size={17} />到这里</Button>
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

function MobileSheet() {
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
      <PlaceDetails />
    </aside>
  );
}

export function MapShell() {
  const navigate = useNavigate();
  const theme = usePreferencesStore((state) => state.theme);
  const toggleTheme = usePreferencesStore((state) => state.toggleTheme);
  const setSelectedFeature = useMapStore((state) => state.setSelectedFeature);
  const sheetHeight = useMapStore((state) => state.sheetHeight);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const mapStyle = useMemo(() => createCampusStyle(theme), [theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function selectFeature(event: MapLayerMouseEvent): void {
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
          onLoad={() => setMapReady(true)}
        >
          <MapControls onThemeToggle={toggleTheme} />
        </Map>
        {!mapReady ? <div className="map-loading"><span className="pulse-ring" /><strong>正在铺开校园地图</strong><small>加载离线矢量图层…</small></div> : null}
        {mapReady && mapError ? <div className="map-error" role="alert"><WifiOff size={16} /><span><strong>地图数据暂时不可用</strong><small>界面仍可浏览，请稍后重试。</small></span><button onClick={() => window.location.reload()}>重试</button></div> : null}
      </div>

      <header className="topbar">
        <Brand />
        <SearchPanel />
        <nav className="top-actions" aria-label="主要导航">
          <Link to="/editor" className="nav-link"><PencilLine size={16} />地图纠错</Link>
          <Button size="icon" variant="secondary" aria-label="打开菜单"><Menu size={18} /></Button>
        </nav>
      </header>

      <nav className="map-toolbar" aria-label="地图工具">
        <Link to="/" className="tool-link is-active"><MapPinned size={18} /><span>地图</span></Link>
        <Link to="/pulsetown" className="tool-link"><Building2 size={18} /><span>城镇</span></Link>
        <Link to="/settings/privacy" className="tool-link"><ShieldCheck size={18} /><span>隐私</span></Link>
        <a href="https://github.com/WALKERKILLER/YourTJ-Pulse" target="_blank" rel="noreferrer" className="tool-link"><CircleHelp size={18} /><span>关于</span></a>
      </nav>

      <aside className="detail-panel"><PlaceDetails /></aside>
      <MobileSheet />

      <div className="map-attribution">
        <span>© OpenStreetMap</span><span>YOURTJ · 2026</span><ArrowRight size={13} />
      </div>
    </main>
  );
}
