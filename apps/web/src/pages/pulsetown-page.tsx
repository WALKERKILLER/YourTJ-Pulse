import { buildTwinMovementPlan, calculateCampusRoutes, deriveTwinBehavior, projectTwinMovement, type NavigationGraph, type NavigationPlace, type TwinBehaviorState } from '@yourtj/campus-navigation';
import { ArrowLeft, Footprints, Home, Pause, Play, School, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import graphData from '../../../../data/generated/navigation-graph.json';
import placesData from '../../../../data/generated/places.json';
import worldConfig from '../../../../data/generated/world-config.json';

const graph = graphData as unknown as NavigationGraph;
const places = placesData as unknown as NavigationPlace[];
const originPlaceId = 'tongji-siping-way-1465759871';
const destinationPlaceId = 'tongji-siping-way-183383474';
const eventStartAt = Date.parse('2026-07-17T08:00:00+08:00');
const eventEndAt = eventStartAt + 100 * 60_000;

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
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const nodes = plan.pathNodeIds.map((id) => nodesById.get(id)).filter((node): node is NonNullable<typeof node> => Boolean(node));
    const bounds = nodes.reduce((current, node) => ({
      minX: Math.min(current.minX, node.x), maxX: Math.max(current.maxX, node.x),
      minY: Math.min(current.minY, node.y), maxY: Math.max(current.maxY, node.y),
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
    const padding = 18;
    const width = Math.max(80, bounds.maxX - bounds.minX + padding * 2);
    const height = Math.max(80, bounds.maxY - bounds.minY + padding * 2);
    const toSvg = (x: number, y: number) => ({ x: x - bounds.minX + padding, y: bounds.maxY - y + padding });
    const routePath = nodes.map((node, index) => {
      const point = toSvg(node.x, node.y);
      return `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    }).join(' ');
    return { plan, route, nodes, toSvg, routePath, width, height };
  }, []);
  const [enabled, setEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [clock, setClock] = useState(() => (demo?.plan.startedAt ?? eventStartAt) - 5 * 60_000);

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

  if (!demo) {
    return <main className="twin-page"><p className="twin-unavailable">演示路线暂时不可用。</p></main>;
  }
  const behavior = enabled ? deriveTwinBehavior(demo.plan, { eventType: 'class', eventStartAt, eventEndAt }, clock) : 'idle';
  const projection = enabled ? projectTwinMovement(demo.plan, graph, clock) : null;
  const marker = projection ? demo.toSvg(projection.x, projection.y) : null;
  const origin = demo.toSvg(demo.nodes[0]!.x, demo.nodes[0]!.y);
  const destination = demo.toSvg(demo.nodes.at(-1)!.x, demo.nodes.at(-1)!.y);
  const timelineStart = demo.plan.startedAt - 5 * 60_000;

  return <main className="twin-page">
    <header className="twin-header">
      <Link to="/" className="back-link"><ArrowLeft size={15} />返回地图</Link>
      <span className="twin-simulation-badge"><ShieldCheck size={14} />数字分身模拟 · 非 GPS 位置</span>
    </header>
    <section className="twin-layout">
      <div className="twin-copy">
        <p className="eyebrow">PULSETOWN · TWIN LAB</p>
        <h1>让日程在校园路网上<br />自然发生。</h1>
        <p>课程时间表只提供上课时间、教室与周次。数字分身根据校园路径生成一次移动计划，之后的位置全部在本机按时间推导。</p>
        <div className="twin-privacy-note"><ShieldCheck size={18} /><span><strong>默认关闭，由你决定是否开启</strong><small>不会读取 GPS，也不会向实时房间广播模拟坐标。</small></span></div>
        <button className={`twin-opt-in ${enabled ? 'is-enabled' : ''}`} onClick={() => {
          setEnabled((current) => !current);
          setPlaying(false);
          setClock(timelineStart);
        }} aria-pressed={enabled}>
          {enabled ? '已开启数字分身模拟' : '开启本次数字分身演示'}
        </button>
      </div>

      <div className={`twin-demo ${enabled ? 'is-enabled' : ''}`}>
        <div className="twin-demo-head">
          <div><span>FRI · 第 3–4 节</span><strong>高等数学 · 教学北楼</strong></div>
          <span className={`twin-state state-${behavior}`}>{stateLabels[behavior]}</span>
        </div>
        <div className="twin-route-stage">
          <svg viewBox={`0 0 ${demo.width} ${demo.height}`} role="img" aria-label="西南一楼到教学北楼的数字分身模拟路线">
            <path className="twin-route-shadow" d={demo.routePath} />
            <path className="twin-route-line" d={demo.routePath} />
            <circle className="twin-place-dot origin" cx={origin.x} cy={origin.y} r="7" />
            <circle className="twin-place-dot destination" cx={destination.x} cy={destination.y} r="7" />
            {marker && projection ? <g className="twin-avatar" transform={`translate(${marker.x} ${marker.y}) rotate(${projection.headingDegrees})`}><circle r="10" /><path d="M 0 -6 L 4 5 L 0 3 L -4 5 Z" /></g> : null}
          </svg>
          <div className="twin-place-label origin"><Home size={13} /><span>西南一楼<small>宿舍 · 起点</small></span></div>
          <div className="twin-place-label destination"><School size={13} /><span>教学北楼<small>教室 · 目的地</small></span></div>
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
