import { featureSchema, type AuthenticatedUser, type GeoJsonFeature } from '@yourtj/contracts';
import { createCampusStyle } from '@yourtj/campus-style';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FeatureCollection, Geometry } from 'geojson';
import type { LayerSpecification } from 'maplibre-gl';
import { Check, ChevronLeft, FileDiff, KeyRound, MapPin, RefreshCw, ShieldCheck, UserRound, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Map, MapControls, MapGeoJSON } from '../components/map/map';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { findFeatureById, geometryChanged, propertyDiff } from '../features/map/diff-utils';
import { apiRequest, fetchSession, type SubmissionDetail, type SubmissionSummary } from '../lib/api';
import { registerPmtilesProtocol } from '../lib/pmtiles';
import { usePreferencesStore } from '../stores/preferences-store';

registerPmtilesProtocol();

interface CampusData {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

const PREVIEW_LAYERS: LayerSpecification[] = [
  { id: 'review-polygons', type: 'fill', source: 'review-preview', filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]], paint: { 'fill-color': '#e24b74', 'fill-opacity': 0.38, 'fill-outline-color': '#8e2444' } },
  { id: 'review-lines', type: 'line', source: 'review-preview', filter: ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]], paint: { 'line-color': '#e24b74', 'line-width': 5 } },
  { id: 'review-points', type: 'circle', source: 'review-preview', filter: ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]], paint: { 'circle-color': '#e24b74', 'circle-radius': 8, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } },
];

function previewCollection(features: GeoJsonFeature[]): FeatureCollection<Geometry> {
  return {
    type: 'FeatureCollection',
    features: features.map((feature) => ({ ...feature, properties: feature.properties ?? null })),
  };
}

function statusText(status: SubmissionSummary['status']): string {
  return status === 'pending' ? '待审核' : status === 'applied' ? '已应用' : '已驳回';
}

export function AdminPage() {
  const queryClient = useQueryClient();
  const theme = usePreferencesStore((state) => state.theme);
  const toggleTheme = usePreferencesStore((state) => state.toggleTheme);
  const [token, setToken] = useState('');
  const [session, setSession] = useState<AuthenticatedUser | null>(null);
  const [authError, setAuthError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editedJson, setEditedJson] = useState('[]');
  const [reviewMessage, setReviewMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState<'apply' | 'reject' | null>(null);
  const [actionFeedback, setActionFeedback] = useState('');
  const style = useMemo(() => createCampusStyle(theme), [theme]);

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const user = await fetchSession(token);
      if (!user.roles.some((role) => role === 'moderator' || role === 'admin')) throw new Error('审核工作台需要 moderator 或 admin 角色');
      return user;
    },
    onSuccess: (user) => {
      setSession(user);
      setAuthError('');
    },
    onError: (error: Error) => { setSession(null); setAuthError(error.message); },
  });

  const queueQuery = useQuery({
    queryKey: ['admin-submissions', session?.id],
    queryFn: () => apiRequest<SubmissionSummary[]>('/api/admin/submissions', token),
    enabled: session !== null,
  });

  const detailQuery = useQuery({
    queryKey: ['admin-submission', selectedId, session?.id],
    queryFn: () => apiRequest<SubmissionDetail>(`/api/admin/submissions/${selectedId}`, token),
    enabled: session !== null && selectedId !== null,
  });

  const campusQuery = useQuery({
    queryKey: ['campus-master-data'],
    queryFn: () => apiRequest<CampusData>('/api/custom-data'),
    enabled: detailQuery.data !== undefined,
  });

  useEffect(() => {
    if (detailQuery.data) setEditedJson(JSON.stringify(detailQuery.data.features, null, 2));
  }, [detailQuery.data]);

  const reviewMutation = useMutation({
    mutationFn: async (action: 'apply' | 'reject') => {
      if (!selectedId) throw new Error('请选择一条投稿');
      let features: GeoJsonFeature[] | undefined;
      if (action === 'apply') {
        const parsed: unknown = JSON.parse(editedJson);
        const result = featureSchema.array().min(1).safeParse(parsed);
        if (!result.success) throw new Error(`修改后的 Feature 未通过校验：${result.error.issues[0]?.message ?? '格式错误'}`);
        features = result.data;
      }
      return apiRequest<{ action: string }>(`/api/admin/submissions/${selectedId}/${action}`, token, {
        method: 'POST',
        body: JSON.stringify({ message: reviewMessage || undefined, ...(features ? { features } : {}) }),
      });
    },
    onSuccess: async ({ action }) => {
      setActionFeedback(action === 'applied' ? '投稿已应用到主数据' : '投稿已驳回');
      setConfirmAction(null);
      setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-submissions'] });
      await queryClient.invalidateQueries({ queryKey: ['campus-master-data'] });
    },
    onError: (error: Error) => setActionFeedback(error.message),
  });

  const detail = detailQuery.data;
  const previewData = useMemo(() => previewCollection(detail?.features ?? []), [detail?.features]);

  if (!session) {
    return (
      <main className="admin-gate"><div className="standalone-grid" aria-hidden="true" /><Link to="/" className="back-link"><ChevronLeft size={17} />返回校园地图</Link><section className="gate-card"><span className="gate-icon"><ShieldCheck size={27} /></span><p className="eyebrow">REVIEW ACCESS</p><h1>审核需要可信身份</h1><p>令牌只保存在当前页面内存，不写入 URL、Cookie 或浏览器存储。</p><div className="gate-form"><Input type="password" autoComplete="off" value={token} onChange={(event) => { setToken(event.target.value); setSession(null); }} placeholder="Bearer access token" /><Button onClick={() => verifyMutation.mutate()} disabled={!token || verifyMutation.isPending}><KeyRound size={16} />{verifyMutation.isPending ? '验证中…' : '进入工作台'}</Button></div>{authError ? <p className="inline-error">{authError}</p> : null}<a href="/legacy-admin" className="legacy-link">迁移期旧版审核入口</a></section></main>
    );
  }

  return (
    <main className="review-workspace">
      <aside className="review-queue">
        <header><Link to="/" className="back-link"><ChevronLeft size={16} />地图</Link><p className="eyebrow">REVIEW QUEUE</p><h1>地图审核</h1><div className="reviewer"><UserRound size={15} /><span>{session.displayName}<small>{session.roles.join(' · ')}</small></span></div></header>
        <div className="queue-title"><strong>待处理投稿</strong><Button size="icon" variant="ghost" aria-label="刷新队列" onClick={() => queueQuery.refetch()}><RefreshCw size={15} /></Button></div>
        <div className="queue-list">
          {queueQuery.isPending ? <p className="queue-state">正在加载审核队列…</p> : queueQuery.isError ? <p className="queue-state is-error">{queueQuery.error.message}</p> : queueQuery.data?.length ? queueQuery.data.map((item) => <button key={item.id} className={`queue-card ${selectedId === item.id ? 'is-active' : ''}`} onClick={() => { setSelectedId(item.id); setActionFeedback(''); }}><span className={`status-pill ${item.status}`}>{statusText(item.status)}</span><strong>{item.message || '未填写纠错说明'}</strong><small>{item.user} · {new Date(item.submittedAt).toLocaleString('zh-CN')}</small><span>{item.count} 个 Feature</span></button>) : <div className="queue-empty"><Check size={22} /><strong>队列已清空</strong><span>目前没有待审核投稿。</span></div>}
        </div>
      </aside>

      <section className="review-map">
        <Map mapStyle={style} initialViewState={{ center: [121.5012, 31.2825], zoom: 15.5, pitch: 32, maxBounds: [[121.48, 31.27], [121.52, 31.295]] }}>
          <MapControls onThemeToggle={toggleTheme} />
          {detail ? <MapGeoJSON id="review-preview" data={previewData} layers={PREVIEW_LAYERS} /> : null}
        </Map>
        {!detail ? <div className="review-map-empty"><FileDiff size={28} /><strong>选择一条投稿开始审核</strong><span>地图会高亮其属性与几何范围。</span></div> : null}
      </section>

      <aside className="review-detail">
        {!detail ? <div className="selection-empty"><FileDiff size={25} /><strong>等待选择</strong><span>从左侧队列打开一条投稿。</span></div> : <>
          <header className="review-detail-header"><div><p className="eyebrow">SUBMISSION · {detail.id.slice(0, 8)}</p><h2>{detail.message || '地图数据纠错'}</h2><span>{detail.user} 提交 · {detail.count} 项</span></div><span className={`status-pill ${detail.status}`}>{statusText(detail.status)}</span></header>
          <div className="review-detail-scroll">
            {detail.features.map((feature, index) => {
              const before = findFeatureById(campusQuery.data?.features ?? [], feature);
              const diffs = propertyDiff(before, feature);
              return <section className="feature-diff" key={String(feature.id ?? index)}><div className="feature-title"><MapPin size={15} /><strong>{String(feature.properties?.name ?? feature.id ?? `Feature ${index + 1}`)}</strong><span>{feature.geometry.type}</span></div><div className={`geometry-diff ${geometryChanged(before, feature) ? 'changed' : 'same'}`}><span>Geometry</span><strong>{before ? (geometryChanged(before, feature) ? '已修改' : '未改变') : '新增几何'}</strong></div><div className="property-diffs">{diffs.map((diff) => <div key={diff.key} className={`property-diff ${diff.kind}`}><code>{diff.key}</code><span>{String(diff.before ?? '∅')}</span><b>→</b><span>{String(diff.after ?? '∅')}</span></div>)}</div></section>;
            })}
            <label className="form-field"><span>审核后 Features JSON</span><textarea rows={14} value={editedJson} onChange={(event) => setEditedJson(event.target.value)} spellCheck="false" /><small>可在应用前修改；提交时再次使用共享 Schema 校验。</small></label>
            <label className="form-field"><span>审核意见</span><textarea rows={3} maxLength={500} value={reviewMessage} onChange={(event) => setReviewMessage(event.target.value)} placeholder="记录判断依据或需改进之处" /></label>
            {detail.reviewedAt ? <div className="review-record"><strong>审核记录</strong><span>{detail.reviewerId} · {new Date(detail.reviewedAt).toLocaleString('zh-CN')}</span><p>{detail.reviewMessage}</p></div> : null}
          </div>
          <footer className="review-actions"><span aria-live="polite">{actionFeedback}</span>{confirmAction ? <div className="inline-confirm"><p>确认{confirmAction === 'apply' ? '应用修改后的数据' : '驳回这条投稿'}？</p><Button variant={confirmAction === 'apply' ? 'primary' : 'danger'} onClick={() => reviewMutation.mutate(confirmAction)} disabled={reviewMutation.isPending}>{reviewMutation.isPending ? '处理中…' : '确认执行'}</Button><Button variant="ghost" onClick={() => setConfirmAction(null)}>取消</Button></div> : <div><Button variant="danger" onClick={() => setConfirmAction('reject')}><X size={16} />驳回</Button><Button onClick={() => setConfirmAction('apply')}><Check size={16} />修改后应用</Button></div>}</footer>
        </>}
      </aside>
    </main>
  );
}
