import type { AuthenticatedUser, GeoJsonFeature } from '@yourtj/contracts';
import { createCampusStyle, INTERACTIVE_LAYER_IDS } from '@yourtj/campus-style';
import { useMutation } from '@tanstack/react-query';
import type { MapLayerMouseEvent } from 'maplibre-gl';
import { Braces, CheckCircle2, ChevronLeft, Eye, KeyRound, MapPin, Send, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Map, MapControls } from '../components/map/map';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { applyEditorFields, editableFeature, fieldsFromFeature, type EditorFields } from '../features/map/editor-utils';
import { apiRequest, fetchSession } from '../lib/api';
import { registerPmtilesProtocol } from '../lib/pmtiles';
import { usePreferencesStore } from '../stores/preferences-store';

registerPmtilesProtocol();

const EMPTY_FIELDS: EditorFields = {
  aliases: '', category: '', description: '', entrance: '', image: '', name: '', openingHours: '', wheelchair: '',
};

function Field({ label, hint, ...props }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <label className="form-field"><span>{label}</span><Input {...props} />{hint ? <small>{hint}</small> : null}</label>;
}

export function EditorPage() {
  const theme = usePreferencesStore((state) => state.theme);
  const toggleTheme = usePreferencesStore((state) => state.toggleTheme);
  const style = useMemo(() => createCampusStyle(theme), [theme]);
  const [original, setOriginal] = useState<GeoJsonFeature | null>(null);
  const [fields, setFields] = useState<EditorFields>(EMPTY_FIELDS);
  const [note, setNote] = useState('');
  const [token, setToken] = useState('');
  const [session, setSession] = useState<AuthenticatedUser | null>(null);
  const [advancedError, setAdvancedError] = useState('');
  const [propertiesJson, setPropertiesJson] = useState('{}');
  const [geometryJson, setGeometryJson] = useState('{}');
  const [feedback, setFeedback] = useState('');
  const advanced = session?.roles.some((role) => ['mapper', 'moderator', 'admin'].includes(role)) ?? false;

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const user = await fetchSession(token);
      if (!user.roles.some((role) => ['mapper', 'moderator', 'admin'].includes(role))) throw new Error('高级编辑需要 mapper、moderator 或 admin 角色');
      return user;
    },
    onSuccess: (user) => { setSession(user); setAdvancedError(''); },
    onError: (error: Error) => { setSession(null); setAdvancedError(error.message); },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!original) throw new Error('请先在地图上选择一个地点');
      let advancedProperties: Record<string, unknown> | undefined;
      let advancedGeometry: unknown;
      if (advanced) {
        const parsedProperties: unknown = JSON.parse(propertiesJson);
        if (typeof parsedProperties !== 'object' || parsedProperties === null || Array.isArray(parsedProperties)) throw new Error('高级属性必须是 JSON 对象');
        advancedProperties = parsedProperties as Record<string, unknown>;
        advancedGeometry = JSON.parse(geometryJson) as unknown;
      }
      const updated = applyEditorFields(original, fields, advancedProperties, advancedGeometry);
      return apiRequest<{ id: string; count: number }>('/api/submit', token || undefined, {
        method: 'POST',
        body: JSON.stringify({ features: [updated], message: note || undefined, user: session?.displayName }),
      });
    },
    onSuccess: ({ id }) => setFeedback(`已提交审核 · ${id.slice(0, 8)}`),
    onError: (error: Error) => setFeedback(error.message),
  });

  function selectFeature(event: MapLayerMouseEvent): void {
    const layers = INTERACTIVE_LAYER_IDS.filter((id) => event.target.getLayer(id));
    const [rendered] = event.target.queryRenderedFeatures(event.point, { layers: [...layers] });
    if (!rendered) return;
    const selected = editableFeature(rendered);
    if (!selected) {
      setFeedback('该要素的几何格式暂不支持编辑');
      return;
    }
    setOriginal(selected);
    setFields(fieldsFromFeature(selected));
    setPropertiesJson(JSON.stringify(selected.properties ?? {}, null, 2));
    setGeometryJson(JSON.stringify(selected.geometry, null, 2));
    setFeedback('');
  }

  function updateField(key: keyof EditorFields, value: string): void {
    setFields((current) => ({ ...current, [key]: value }));
  }

  const preview = original ? (() => {
    try {
      return applyEditorFields(original, fields, advanced ? JSON.parse(propertiesJson) as Record<string, unknown> : undefined, advanced ? JSON.parse(geometryJson) as unknown : undefined);
    } catch {
      return null;
    }
  })() : null;

  return (
    <main className="workspace-page editor-workspace">
      <section className="workspace-map">
        <Map mapStyle={style} initialViewState={{ center: [121.5012, 31.2825], zoom: 15.7, pitch: 28, maxBounds: [[121.48, 31.27], [121.52, 31.295]] }} onClick={selectFeature}>
          <MapControls onThemeToggle={toggleTheme} />
        </Map>
        <Link to="/" className="workspace-back"><ChevronLeft size={17} />返回地图</Link>
        <div className="map-instruction"><MapPin size={17} /><span><strong>选择要纠错的地点</strong><small>点击建筑或 POI 后填写右侧表单</small></span></div>
      </section>

      <aside className="workspace-panel">
        <header className="workspace-header"><p className="eyebrow">MAP EDITOR · TASK-104</p><h1>让校园地图更准确</h1><p>友好字段优先；原始标签和几何只向 Mapper 开放。</p></header>
        <div className="workspace-scroll">
          {!original ? <div className="selection-empty"><MapPin size={25} /><strong>还没有选择地点</strong><span>从左侧地图点击建筑或地点开始。</span></div> : (
            <>
              <section className="form-section"><div className="section-title"><span>01</span><div><strong>地点信息</strong><small>{String(original.id ?? '未标识要素')}</small></div></div>
                <Field label="名称" value={fields.name} onChange={(event) => updateField('name', event.target.value)} placeholder="例如：同济大学图书馆" />
                <div className="form-grid"><Field label="类别" value={fields.category} onChange={(event) => updateField('category', event.target.value)} placeholder="library" /><Field label="别名" value={fields.aliases} onChange={(event) => updateField('aliases', event.target.value)} placeholder="多个别名用分号分隔" /></div>
                <label className="form-field"><span>描述</span><textarea value={fields.description} onChange={(event) => updateField('description', event.target.value)} rows={3} placeholder="简短说明用途、位置或注意事项" /></label>
              </section>
              <section className="form-section"><div className="section-title"><span>02</span><div><strong>到访信息</strong><small>帮助同学顺利到达</small></div></div>
                <Field label="开放时间" value={fields.openingHours} onChange={(event) => updateField('openingHours', event.target.value)} placeholder="Mo-Su 07:30-22:30" />
                <div className="form-grid"><Field label="入口" value={fields.entrance} onChange={(event) => updateField('entrance', event.target.value)} placeholder="main / yes" /><Field label="无障碍" value={fields.wheelchair} onChange={(event) => updateField('wheelchair', event.target.value)} placeholder="yes / limited / no" /></div>
                <Field label="图片 URL" type="url" value={fields.image} onChange={(event) => updateField('image', event.target.value)} placeholder="https://…" />
                <label className="form-field"><span>纠错说明</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={500} placeholder="说明为什么修改，便于审核者判断" /></label>
              </section>
              <section className="form-section advanced-section"><div className="section-title"><span><KeyRound size={14} /></span><div><strong>Mapper 高级编辑</strong><small>令牌仅保存在当前页面内存</small></div></div>
                {!advanced || !session ? <div className="token-row"><Input type="password" autoComplete="off" value={token} onChange={(event) => { setToken(event.target.value); setSession(null); }} placeholder="Bearer access token" /><Button variant="secondary" onClick={() => verifyMutation.mutate()} disabled={!token || verifyMutation.isPending}>验证身份</Button></div> : <div className="role-badge"><CheckCircle2 size={15} />{session.displayName} · {session.roles.join(' / ')}</div>}
                {advancedError ? <p className="inline-error"><ShieldAlert size={14} />{advancedError}</p> : null}
                {advanced ? <div className="advanced-grid"><label className="form-field"><span><Braces size={14} />原始 Tags</span><textarea value={propertiesJson} onChange={(event) => setPropertiesJson(event.target.value)} rows={10} spellCheck="false" /></label><label className="form-field"><span><Braces size={14} />Geometry</span><textarea value={geometryJson} onChange={(event) => setGeometryJson(event.target.value)} rows={10} spellCheck="false" /></label></div> : null}
              </section>
              <section className="change-preview"><div><Eye size={16} /><strong>修改预览</strong></div><code>{preview ? `${fieldsFromFeature(original).name || '未命名'} → ${fields.name || '未命名'}` : '高级 JSON 尚未通过校验'}</code></section>
            </>
          )}
        </div>
        <footer className="workspace-footer"><span aria-live="polite">{feedback}</span><Button onClick={() => submitMutation.mutate()} disabled={!original || submitMutation.isPending}><Send size={16} />{submitMutation.isPending ? '提交中…' : '提交审核'}</Button></footer>
      </aside>
    </main>
  );
}
