import { useState } from 'react';
import { PlaceholderPage } from './placeholder-page';

export function PrivacyPage() {
  const [locationSharing, setLocationSharing] = useState(false);
  const [preciseLocation, setPreciseLocation] = useState(false);
  return (
    <PlaceholderPage eyebrow="PRIVACY BY DEFAULT" title="位置由你掌握">
      <p>所有共享默认关闭。此页面不会把选择写入持久存储，也不会在未加入房间时请求定位。</p>
      <label className="setting-row"><span><strong>房间内共享位置</strong><small>只在当前协作房间中显示</small></span><input type="checkbox" checked={locationSharing} onChange={(event) => setLocationSharing(event.target.checked)} /></label>
      <label className="setting-row"><span><strong>精确位置</strong><small>关闭时仅共享模糊区域</small></span><input type="checkbox" checked={preciseLocation} disabled={!locationSharing} onChange={(event) => setPreciseLocation(event.target.checked)} /></label>
    </PlaceholderPage>
  );
}
