import { CirclePause, CirclePlay, KeyRound, Radio, Square, Users } from 'lucide-react';
import { useState } from 'react';

import { Button } from '../../components/ui/button';
import type { useRoomRealtime } from './use-room-realtime';

type RoomRealtimeState = ReturnType<typeof useRoomRealtime>;

const CONNECTION_LABELS: Record<RoomRealtimeState['connectionStatus'], string> = {
  connecting: '正在连接',
  connected: '实时在线',
  reconnecting: '正在重连',
  disconnected: '未连接',
  expired: '房间已过期',
  error: '连接异常',
};

export function RoomSharingPanel({ realtime, roomId }: { realtime: RoomRealtimeState; roomId: string }) {
  const [accessToken, setAccessToken] = useState('');
  const sharing = realtime.device.status === 'active' && !realtime.device.paused;
  const memberCount = realtime.members.length;
  return (
    <section className="room-sharing-panel" aria-label="房间位置共享" aria-live="polite">
      <div className="sharing-heading">
        <span className={`connection-dot is-${realtime.connectionStatus}`}><Radio size={15} /></span>
        <div><strong>{CONNECTION_LABELS[realtime.connectionStatus]}</strong><small>房间 {roomId}</small></div>
        <span className="member-count"><Users size={13} />{memberCount}</span>
      </div>
      <dl className="sharing-facts">
        <div><dt>共享状态</dt><dd>{sharing ? '正在共享' : realtime.device.paused ? '已暂停' : '未共享'}</dd></div>
        <div><dt>共享对象</dt><dd>仅当前房间成员</dd></div>
        <div><dt>共享级别</dt><dd>{realtime.locationSharingLevel === 'precise' ? '精确位置' : realtime.locationSharingLevel === 'approximate' ? '模糊区域（约 80 米）' : '隐藏'}</dd></div>
      </dl>
      <label className="setting-row">
        <span><strong>房间共享精度</strong><small>模糊模式由服务端网格化，其他成员不会收到精确坐标</small></span>
        <select value={realtime.locationSharingLevel} disabled={sharing} onChange={(event) => realtime.setLocationSharingLevel(event.target.value as 'precise' | 'approximate' | 'hidden')}>
          <option value="approximate">模糊（推荐）</option>
          <option value="precise">精确</option>
          <option value="hidden">隐藏</option>
        </select>
      </label>
      {realtime.device.error || realtime.error ? <p className="sharing-error" role="alert">{realtime.device.error ?? realtime.error}</p> : null}
      <form className="sharing-token" onSubmit={(event) => { event.preventDefault(); realtime.configureAccessToken(accessToken); }}>
        <KeyRound size={13} aria-hidden="true" />
        <input type="password" value={accessToken} onChange={(event) => setAccessToken(event.target.value)} autoComplete="off" aria-label="实时会话 Token" placeholder="可信 Session（开发模式可留空）" />
        <button type="submit">连接</button>
      </form>
      <div className="sharing-actions">
        {!sharing ? <Button onClick={realtime.startSharing} disabled={realtime.connectionStatus === 'expired' || realtime.locationSharingLevel === 'hidden'}><CirclePlay size={15} />{realtime.device.paused ? '继续共享' : '开始共享'}</Button> : <Button variant="secondary" onClick={realtime.pauseSharing}><CirclePause size={15} />暂停</Button>}
        <Button variant="ghost" onClick={realtime.stopSharing} disabled={!realtime.device.location && !realtime.device.paused}><Square size={14} />停止</Button>
      </div>
    </section>
  );
}
