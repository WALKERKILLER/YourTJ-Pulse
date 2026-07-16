import type { RouteProfile } from '@yourtj/campus-navigation';
import { Accessibility, Bike, CheckCircle2, Footprints, LocateFixed, Map, Navigation, Route, Share2, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useNavigationStore } from '../../stores/navigation-store';

const PROFILES: Array<{ icon: typeof Footprints; id: RouteProfile; label: string }> = [
  { id: 'walking', label: '步行', icon: Footprints },
  { id: 'cycling', label: '骑行', icon: Bike },
  { id: 'wheelchair', label: '无障碍', icon: Accessibility },
];

function formatDistance(meters: number): string {
  return meters >= 1_000 ? `${(meters / 1_000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function formatDuration(seconds: number): string {
  return `${Math.max(1, Math.round(seconds / 60))} 分钟`;
}

interface NavigationPanelProps {
  onOverview: () => void;
  onPlan: () => void;
  onShare: () => void;
  onStartFollowing: () => void;
}

export function NavigationPanel({ onOverview, onPlan, onShare, onStartFollowing }: NavigationPanelProps) {
  const destination = useNavigationStore((state) => state.destination);
  const profile = useNavigationStore((state) => state.profile);
  const setProfile = useNavigationStore((state) => state.setProfile);
  const routes = useNavigationStore((state) => state.routes);
  const activeRouteIndex = useNavigationStore((state) => state.activeRouteIndex);
  const setActiveRouteIndex = useNavigationStore((state) => state.setActiveRouteIndex);
  const status = useNavigationStore((state) => state.status);
  const message = useNavigationStore((state) => state.message);
  const clearNavigation = useNavigationStore((state) => state.clearNavigation);
  const route = routes[activeRouteIndex];
  const offRoute = status === 'following' && message?.startsWith('已偏离路线');

  if (!destination) return null;
  return (
    <article className="navigation-panel" aria-live="polite">
      <div className="detail-heading">
        <div><p className="eyebrow">校园导航</p><h1>{destination.name}</h1></div>
        <Button size="icon" variant="ghost" onClick={clearNavigation} aria-label="退出导航"><X size={18} /></Button>
      </div>

      <div className="profile-tabs" aria-label="路线模式">
        {PROFILES.map(({ id, label, icon: Icon }) => <button key={id} className={profile === id ? 'is-active' : ''} onClick={() => setProfile(id)} aria-pressed={profile === id}><Icon size={15} />{label}</button>)}
      </div>

      {status === 'routing' ? <div className="route-state"><span className="pulse-ring" /><strong>正在本机规划路线…</strong></div> : null}
      {status === 'error' ? <div className="route-state is-error"><Route size={20} /><strong>{message ?? '暂时找不到可达路线'}</strong><Button onClick={onPlan}>重新规划</Button></div> : null}
      {status === 'arrived' ? <div className="route-state is-arrived"><CheckCircle2 size={26} /><strong>已到达 {destination.name}</strong><Button onClick={clearNavigation}>完成导航</Button></div> : null}

      {routes.length ? (
        <>
          <div className="route-options" aria-label="备选路线">
            {routes.map((candidate, index) => <button key={candidate.id} className={index === activeRouteIndex ? 'is-active' : ''} onClick={() => setActiveRouteIndex(index)}><strong>{index === 0 ? '推荐路线' : `备选 ${index}`}</strong><span>{formatDuration(candidate.durationSeconds)} · {formatDistance(candidate.distanceMeters)}</span></button>)}
          </div>
          {route ? <div className="next-instruction"><Navigation size={19} /><span><small>{status === 'following' ? '正在导航' : '路线预览'}</small><strong>{message ?? route.instructions[0]?.text ?? '沿路线前进'}</strong></span></div> : null}
          <div className="navigation-actions">
            <Button onClick={offRoute ? onPlan : status === 'following' ? onOverview : onStartFollowing}>
              {offRoute ? <Route size={16} /> : <LocateFixed size={16} />}{offRoute ? '重新规划' : status === 'following' ? '路线概览' : '开始导航'}
            </Button>
            <Button variant="secondary" onClick={onOverview}><Map size={16} />概览</Button>
            <Button variant="secondary" onClick={onShare}><Share2 size={16} />分享</Button>
          </div>
        </>
      ) : status !== 'routing' && status !== 'error' && status !== 'arrived' ? (
        <div className="route-state"><LocateFixed size={24} /><strong>以当前位置为起点</strong><span>定位仅用于本次路线计算，不会保存轨迹。</span><Button onClick={onPlan}>规划路线</Button></div>
      ) : null}
    </article>
  );
}
