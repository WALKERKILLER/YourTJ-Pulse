import { createCampusStyle } from '@yourtj/campus-style';
import { buildTwinMovementPlan, calculateCampusRoutes, deriveTwinBehavior, projectTwinMovement, type NavigationGraph, type NavigationPlace, type TwinBehaviorState } from '@yourtj/campus-navigation';
import { ArrowLeft, Footprints, Pause, Play, Settings2, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import graphData from '../../../../data/generated/navigation-graph.json';
import placesData from '../../../../data/generated/places.json';
import worldConfig from '../../../../data/generated/world-config.json';
import { Map, MapMarker, MarkerContent } from '../components/map/map';
import { detectPulseCapability, resolvePulseQuality } from '../features/pulsetown/quality';
import { PulseTownThreeLayer } from '../features/pulsetown/pulsetown-three-layer';
import { registerPmtilesProtocol } from '../lib/pmtiles';
import { usePreferencesStore } from '../stores/preferences-store';

const graph = graphData as unknown as NavigationGraph;
const places = placesData as unknown as NavigationPlace[];
const originPlaceId = 'tongji-siping-way-1465759871';
const destinationPlaceId = 'tongji-siping-way-183383474';
const eventStartAt = Date.parse('2026-07-17T08:00:00+08:00');
const eventEndAt = eventStartAt + 100 * 60_000;

registerPmtilesProtocol();

const stateLabels: Record<TwinBehaviorState, string> = {
  idle: '待机', preparing: '准备出门', walking: '步行中', running: '跑步中', cycling: '骑行中', arrived: '已到达',
  in_class: '上课中', eating: '用餐中', studying: '自习中', exercising: '运动中', returning_home: '返回宿舍', sleeping: '休息中',
};

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }).format(timestamp);
}

export function PulseTownPage() {
  const demo = useMemo(() => {
    const route = calculateCampusRoutes(graph, places, {
      origin: { placeId: originPlaceId }, destination: { placeId: destinationPlaceId }, profile: 'walking',
    }, { alternativeCount: 1, metersPerSceneUnit: worldConfig.metersPerSceneUnit })[0];
    if (!route) return null;
    const plan = buildTwinMovementPlan({
      id: 'web-demo-plan', userId: 'web-demo-user', eventId: 'web-demo-class', originPlaceId, destinationPlaceId,
      eventStartAt, movementType: 'walk', route, routeVersion: graph.version,
    });
    const origin = places.find((place) => place.id === originPlaceId)!;
    const destination = places.find((place) => place.id === destinationPlaceId)!;
    return {
      plan,
      route,
      center: [(origin.longitude + destination.longitude) / 2, (origin.latitude + destination.latitude) / 2] as [number, number],
      originNode: graph.nodes.find((node) => node.id === plan.pathNodeIds[0])!,
    };
  }, []);
  const [enabled, setEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [fallbackReason, setFallbackReason] = useState('');
  const [clock, setClock] = useState(() => (demo?.plan.startedAt ?? eventStartAt) - 5 * 60_000);
  const avatarAnimation = usePreferencesStore((state) => state.avatarAnimation);
  const hd2d = usePreferencesStore((state) => state.hd2d);
  const particles = usePreferencesStore((state) => state.particles);
  const pulseQuality = usePreferencesStore((state) => state.pulseQuality);
  const shadows = usePreferencesStore((state) => state.shadows);
  const theme = usePreferencesStore((state) => state.theme);
  const weather = usePreferencesStore((state) => state.weather);
  const setAvatarAnimation = usePreferencesStore((state) => state.setAvatarAnimation);
  const setHd2d = usePreferencesStore((state) => state.setHd2d);
  const setParticles = usePreferencesStore((state) => state.setParticles);
  const setPulseQuality = usePreferencesStore((state) => state.setPulseQuality);
  const setShadows = usePreferencesStore((state) => state.setShadows);
  const setWeather = usePreferencesStore((state) => state.setWeather);
  const mapStyle = useMemo(() => createCampusStyle(theme), [theme]);

  const timelineEnd = eventStartAt + 12 * 60_000;
  useEffect(() => {
    if (!enabled || !playing) return undefined;
    const timer = window.setInterval(() => setClock((current) => {
      if (current >= timelineEnd) {
        setPlaying(false);
        return timelineEnd;
      }
      return Math.min(timelineEnd, current + 15_000);
    }), 250);
    return () => window.clearInterval(timer);
  }, [enabled, playing, timelineEnd]);

  const useFallback = useCallback((reason: string) => {
    setFallbackReason(reason);
    setPulseQuality('low');
  }, [setPulseQuality]);

  if (!demo) return <main className="twin-page"><p className="twin-unavailable">演示路线暂时不可用。</p></main>;
  const behavior = enabled ? deriveTwinBehavior(demo.plan, { eventType: 'class', eventStartAt, eventEndAt }, clock) : 'idle';
  const projection = enabled ? projectTwinMovement(demo.plan, graph, clock) : null;
  const timelineStart = demo.plan.startedAt - 5 * 60_000;
  const avatarState = behavior === 'running' ? 'run' : behavior === 'walking' ? 'walk' : 'idle';
  const avatar = {
    x: projection?.x ?? demo.originNode.x,
    y: projection?.y ?? demo.originNode.y,
    headingDegrees: projection?.headingDegrees ?? 0,
    state: avatarState as 'idle' | 'walk' | 'run',
  };
  const effectiveQuality = enabled && hd2d ? pulseQuality : 'low';

  return <main className="twin-page">
    <header className="twin-header">
      <Link to="/" className="back-link"><ArrowLeft size={15} />返回地图</Link>
      <span className="twin-simulation-badge"><ShieldCheck size={14} />数字分身模拟 · 非 GPS 位置</span>
    </header>
    <section className="twin-layout">
      <div className="twin-copy">
        <p className="eyebrow">PULSETOWN · HD-2D LAB</p>
        <h1>让日程在校园世界里<br />自然发生。</h1>
        <p>课程时间表只提供上课时间、教室与周次。服务端生成一次移动计划，人物位置在本机推导；Three.js 只绘制小范围校园原型。</p>
        <div className="twin-privacy-note"><ShieldCheck size={18} /><span><strong>默认关闭，由你决定是否开启</strong><small>不会读取 GPS，也不会向实时房间广播模拟坐标。</small></span></div>
        <button className={`twin-opt-in ${enabled ? 'is-enabled' : ''}`} onClick={() => {
          const next = !enabled;
          setEnabled(next);
          setPlaying(false);
          setClock(timelineStart);
          setFallbackReason('');
          if (next) {
            const capability = detectPulseCapability();
            const quality = resolvePulseQuality(capability);
            setPulseQuality(quality);
            if (!capability.webgl) setFallbackReason('当前环境不支持 Three.js，已使用普通地图');
          }
        }} aria-pressed={enabled}>{enabled ? '已开启数字分身模拟' : '开启本次数字分身演示'}</button>

        <details className="twin-settings">
          <summary><Settings2 size={14} />图形与动画设置</summary>
          <label>质量<select value={pulseQuality} onChange={(event) => { setFallbackReason(''); setPulseQuality(event.target.value as 'high' | 'medium' | 'low'); }}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
          <label><input type="checkbox" checked={hd2d} onChange={(event) => setHd2d(event.target.checked)} />HD-2D</label>
          <label><input type="checkbox" checked={weather} onChange={(event) => setWeather(event.target.checked)} />天气</label>
          <label><input type="checkbox" checked={shadows} onChange={(event) => setShadows(event.target.checked)} />阴影</label>
          <label><input type="checkbox" checked={particles} onChange={(event) => setParticles(event.target.checked)} />粒子</label>
          <label><input type="checkbox" checked={avatarAnimation} onChange={(event) => setAvatarAnimation(event.target.checked)} />分身动画</label>
        </details>
      </div>

      <div className={`twin-demo ${enabled ? 'is-enabled' : ''}`}>
        <div className="twin-demo-head">
          <div><span>FRI · 第 3–4 节</span><strong>西南一楼 → 教学北楼</strong></div>
          <span className={`twin-state state-${behavior}`}>{stateLabels[behavior]}</span>
        </div>
        <div className="twin-route-stage twin-map-stage">
          <Map mapStyle={mapStyle} initialViewState={{ center: demo.center, zoom: 16.1, pitch: 55, bearing: -8 }}>
            {enabled && effectiveQuality !== 'low' ? <PulseTownThreeLayer avatar={avatar} avatarAnimation={avatarAnimation} onUnavailable={useFallback} particles={particles} quality={effectiveQuality} shadows={shadows} weather={weather} /> : null}
            {enabled && effectiveQuality === 'low' && projection ? <MapMarker longitude={projection.longitude} latitude={projection.latitude}><MarkerContent className="twin-low-avatar"><Footprints size={14} /></MarkerContent></MapMarker> : null}
          </Map>
          <span className="twin-quality-badge">{effectiveQuality.toUpperCase()} · {effectiveQuality === 'low' ? 'MAPLIBRE FALLBACK' : 'THREE.JS'}</span>
          {fallbackReason ? <span className="twin-fallback-note" role="status">{fallbackReason}</span> : null}
        </div>
        <div className="twin-facts">
          <span><Footprints size={14} /><strong>{Math.round(demo.route.distanceMeters)} m</strong><small>校园道路</small></span>
          <span><strong>{formatTime(clock)}</strong><small>演示时间</small></span>
          <span><strong>{Math.round((projection?.progress ?? 0) * 100)}%</strong><small>计划进度</small></span>
        </div>
        <div className="twin-controls">
          <button disabled={!enabled} onClick={() => setPlaying((current) => !current)} aria-label={playing ? '暂停演示' : '播放演示'}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
          <input disabled={!enabled} type="range" min={timelineStart} max={timelineEnd} step={1_000} value={clock} onChange={(event) => { setPlaying(false); setClock(Number(event.target.value)); }} aria-label="数字分身演示时间" />
        </div>
        {!enabled ? <div className="twin-demo-lock"><ShieldCheck size={24} /><strong>等待你的明确授权</strong><span>开启后才会在本页计算模拟位置</span></div> : null}
      </div>
    </section>
  </main>;
}
