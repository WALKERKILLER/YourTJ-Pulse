import type { PinStatus, PinType } from '@yourtj/contracts';
import { AlertTriangle, Flag, History, MessageCircle, Plus, Save, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { apiRequest } from '../../lib/api';
import type { useRoomRealtime } from './use-room-realtime';

type RoomRealtimeState = ReturnType<typeof useRoomRealtime>;

export interface PinDraftCoordinate {
  latitude: number;
  longitude: number;
}

interface PinComment {
  id: string;
  authorName: string;
  content: string;
  createdAt: string;
}

interface PinActivity {
  id: string;
  actorName: string | null;
  action: string;
  createdAt: string;
}

const TYPE_OPTIONS: Array<{ label: string; value: PinType }> = [
  { value: 'meeting', label: '集合' },
  { value: 'task', label: '任务' },
  { value: 'event', label: '活动' },
  { value: 'warning', label: '提醒' },
  { value: 'repair', label: '报修' },
  { value: 'lost_found', label: '失物招领' },
  { value: 'checkin', label: '打卡' },
  { value: 'road_closed', label: '道路封闭' },
];

const TYPE_LABELS = Object.fromEntries(TYPE_OPTIONS.map(({ label, value }) => [value, label])) as Record<PinType, string>;
const STATUS_LABELS: Record<PinStatus, string> = {
  draft: '草稿', active: '进行中', resolved: '已解决', expired: '已过期', deleted: '已删除',
  reported: '已上报', confirmed: '已确认', processing: '处理中', rejected: '已驳回',
};
const NEXT_STATUS: Partial<Record<PinStatus, PinStatus[]>> = {
  draft: ['active'],
  active: ['resolved', 'expired'],
  resolved: ['active'],
  reported: ['confirmed', 'rejected'],
  confirmed: ['processing', 'rejected'],
  processing: ['resolved', 'rejected'],
};

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', month: 'numeric', day: 'numeric' })
    .format(new Date(value));
}

function activityLabel(action: string): string {
  const labels: Record<string, string> = {
    'pin.create': '创建了 Pin',
    'pin.update': '更新了 Pin',
    'pin.delete': '删除了 Pin',
    'pin.comment.create': '添加了评论',
    'pin.report.create': '提交了举报',
    'pin.report.resolve': '处理了举报',
  };
  return labels[action] ?? action;
}

interface RoomPinPanelProps {
  draft: PinDraftCoordinate | null;
  onDraftChange: (draft: PinDraftCoordinate | null) => void;
  onPlacingChange: (placing: boolean) => void;
  onSelectPin: (pinId: string | null) => void;
  placing: boolean;
  realtime: RoomRealtimeState;
  roomId: string;
  selectedPinId: string | null;
}

export function RoomPinPanel({
  draft,
  onDraftChange,
  onPlacingChange,
  onSelectPin,
  placing,
  realtime,
  roomId,
  selectedPinId,
}: RoomPinPanelProps) {
  const selected = realtime.pins.find((pin) => pin.id === selectedPinId) ?? null;
  const [createType, setCreateType] = useState<PinType>('meeting');
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editStatus, setEditStatus] = useState<PinStatus>('active');
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<PinComment[]>([]);
  const [activity, setActivity] = useState<PinActivity[]>([]);
  const [reportDetail, setReportDetail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const lastMutationRequestId = useRef<string | null>(null);

  const token = realtime.accessToken || undefined;
  const statuses = useMemo(() => selected
    ? [selected.status, ...(NEXT_STATUS[selected.status] ?? [])]
    : [], [selected]);

  useEffect(() => {
    if (!selected) return;
    setEditTitle(selected.title);
    setEditStatus(selected.status);
  }, [selected?.id]);

  useEffect(() => {
    if (!selected) {
      setComments([]);
      setActivity([]);
      return;
    }
    let cancelled = false;
    void Promise.all([
      apiRequest<PinComment[]>(`/api/pins/${encodeURIComponent(selected.id)}/comments`, token),
      apiRequest<PinActivity[]>(`/api/pins/${encodeURIComponent(selected.id)}/activity`, token),
    ]).then(([nextComments, nextActivity]) => {
      if (cancelled) return;
      setComments(nextComments);
      setActivity(nextActivity);
    }).catch((error: unknown) => {
      if (!cancelled) setMessage(error instanceof Error ? error.message : '无法加载 Pin 详情');
    });
    return () => { cancelled = true; };
  }, [selected?.id, selected?.version, token]);

  useEffect(() => {
    if (realtime.errorCode !== 'PIN_VERSION_CONFLICT'
      || realtime.errorRequestId !== lastMutationRequestId.current) return;
    setMessage('此 Pin 已被其他成员更新；已保留你的输入，请对照最新版本后再次提交。');
    void realtime.refreshPins();
  }, [realtime.errorCode, realtime.errorRequestId, realtime.refreshPins]);

  function submitCreate(event: FormEvent): void {
    event.preventDefault();
    if (!draft) {
      setMessage('请先在地图上选择 Pin 位置。');
      onPlacingChange(true);
      return;
    }
    const requestId = realtime.createPin({
      roomId,
      type: createType,
      title: createTitle,
      description: createDescription.trim() || null,
      longitude: draft.longitude,
      latitude: draft.latitude,
      status: createType === 'repair' ? 'reported' : 'active',
      visibility: 'room',
    });
    if (!requestId) {
      setMessage('实时连接尚未就绪，请稍后重试。');
      return;
    }
    setCreateTitle('');
    setCreateDescription('');
    onDraftChange(null);
    onPlacingChange(false);
    setMessage('Pin 已提交，正在同步给房间成员。');
  }

  function submitUpdate(event: FormEvent): void {
    event.preventDefault();
    if (!selected) return;
    const update: { expectedVersion: number; status?: PinStatus; title?: string } = {
      expectedVersion: selected.version,
    };
    if (editTitle.trim() !== selected.title) update.title = editTitle.trim();
    if (editStatus !== selected.status) update.status = editStatus;
    if (!update.title && !update.status) {
      setMessage('没有需要保存的更改。');
      return;
    }
    lastMutationRequestId.current = realtime.updatePin(selected.id, update);
    setMessage(lastMutationRequestId.current ? '更新已提交，等待房间确认。' : '实时连接尚未就绪。');
  }

  function deleteSelected(): void {
    if (!selected) return;
    const requestId = realtime.deletePin(selected.id, selected.version);
    lastMutationRequestId.current = requestId;
    setMessage(requestId ? '删除已提交，将同步给所有房间成员；操作记录仍保留。' : '实时连接尚未就绪。');
  }

  async function submitComment(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!selected || !comment.trim()) return;
    try {
      const created = await apiRequest<PinComment>(`/api/pins/${encodeURIComponent(selected.id)}/comments`, token, {
        method: 'POST', body: JSON.stringify({ content: comment }),
      });
      setComments((current) => [...current, created]);
      setComment('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '评论失败');
    }
  }

  async function submitReport(): Promise<void> {
    if (!selected) return;
    try {
      await apiRequest(`/api/pins/${encodeURIComponent(selected.id)}/reports`, token, {
        method: 'POST',
        body: JSON.stringify({ reason: 'inaccurate', detail: reportDetail.trim() || null }),
      });
      setReportDetail('');
      setMessage('举报已提交，审核人员可在操作链路中处理。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '举报失败');
    }
  }

  if (selected) {
    return (
      <article className="place-detail room-pin-detail">
        <div className="detail-heading">
          <div><p className="eyebrow">{TYPE_LABELS[selected.type]} · v{selected.version}</p><h1>{selected.title}</h1></div>
          <Button size="icon" variant="ghost" onClick={() => onSelectPin(null)} aria-label="返回 Pin 列表"><X size={18} /></Button>
        </div>
        <div className="pin-coordinate">{selected.longitude.toFixed(5)}, {selected.latitude.toFixed(5)}</div>
        <form className="pin-form" onSubmit={submitUpdate}>
          <label><span>标题</span><Input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={120} /></label>
          <label><span>状态</span><select value={editStatus} onChange={(event) => setEditStatus(event.target.value as PinStatus)}>
            {statuses.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
          </select></label>
          <div className="pin-form-actions">
            <Button type="submit"><Save size={15} />保存版本</Button>
            <Button type="button" variant="ghost" onClick={deleteSelected}><Trash2 size={15} />删除</Button>
          </div>
        </form>

        <section className="pin-thread">
          <h2><MessageCircle size={15} />评论</h2>
          {comments.length ? comments.map((item) => <div key={item.id} className="pin-comment"><strong>{item.authorName}</strong><span>{item.content}</span><time>{formatTime(item.createdAt)}</time></div>) : <p>还没有评论。</p>}
          <form onSubmit={(event) => void submitComment(event)}><Input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="补充现场信息" maxLength={1_000} /><Button type="submit" size="sm">发送</Button></form>
        </section>

        <section className="pin-thread">
          <h2><History size={15} />操作记录</h2>
          {activity.map((item) => <div key={item.id} className="pin-activity"><span>{item.actorName ?? '系统'} {activityLabel(item.action)}</span><time>{formatTime(item.createdAt)}</time></div>)}
        </section>

        <section className="pin-report">
          <h2><Flag size={15} />报告信息不准确</h2>
          <Input value={reportDetail} onChange={(event) => setReportDetail(event.target.value)} placeholder="可选：说明问题" maxLength={1_000} />
          <Button type="button" size="sm" variant="secondary" onClick={() => void submitReport()}>提交举报</Button>
        </section>
        {message ? <p className="pin-message" role="status"><AlertTriangle size={14} />{message}</p> : null}
      </article>
    );
  }

  return (
    <article className="place-detail room-pin-detail">
      <div className="detail-heading"><div><p className="eyebrow">协作房间</p><h1>地图 Pin</h1></div><span className="pin-count">{realtime.pins.length}</span></div>
      <p className="pin-intro">房间成员可共同创建和版本化编辑；位置只保存为 Pin，不保存 GPS 轨迹。</p>
      <Button className="pin-place-button" variant={placing ? 'secondary' : 'primary'} onClick={() => onPlacingChange(!placing)}>
        <Plus size={16} />{placing ? '点击地图确定位置' : '放置新 Pin'}
      </Button>
      {draft ? (
        <form className="pin-form pin-create-form" onSubmit={submitCreate}>
          <p className="pin-coordinate">已选 {draft.longitude.toFixed(5)}, {draft.latitude.toFixed(5)}</p>
          <label><span>类型</span><select value={createType} onChange={(event) => setCreateType(event.target.value as PinType)}>{TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label><span>标题</span><Input required value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} placeholder="发生了什么？" maxLength={120} /></label>
          <label><span>说明</span><textarea value={createDescription} onChange={(event) => setCreateDescription(event.target.value)} maxLength={2_000} placeholder="可选的协作说明" /></label>
          <Button type="submit">创建并同步</Button>
        </form>
      ) : null}
      <div className="pin-list">
        {realtime.pins.map((pin) => <button key={pin.id} onClick={() => onSelectPin(pin.id)}>
          <span className={`pin-type-dot is-${pin.type}`} /><span><strong>{pin.title}</strong><small>{TYPE_LABELS[pin.type]} · {STATUS_LABELS[pin.status]} · v{pin.version}</small></span>
        </button>)}
        {!realtime.pins.length ? <p>房间里还没有 Pin，在地图上放置第一个协作标记。</p> : null}
      </div>
      {realtime.pinLoadError || message ? <p className="pin-message" role="status"><AlertTriangle size={14} />{message ?? realtime.pinLoadError}</p> : null}
    </article>
  );
}
