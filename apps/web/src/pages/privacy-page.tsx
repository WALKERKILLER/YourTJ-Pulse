import { PlaceholderPage } from './placeholder-page';
import { usePrivacyStore } from '../stores/privacy-store';

export function PrivacyPage() {
  const locationSharingLevel = usePrivacyStore((state) => state.locationSharingLevel);
  const setLocationSharingLevel = usePrivacyStore((state) => state.setLocationSharingLevel);
  return (
    <PlaceholderPage eyebrow="PRIVACY BY DEFAULT" title="位置由你掌握">
      <p>所有共享默认关闭，只有在房间中主动开始后才读取定位。偏好只保存在当前页面进程，不写入轨迹或账号资料。</p>
      <label className="setting-row"><span><strong>默认共享级别</strong><small>进入房间后仍需再次点击“开始共享”</small></span><select value={locationSharingLevel} onChange={(event) => setLocationSharingLevel(event.target.value as 'precise' | 'approximate' | 'hidden')}><option value="approximate">模糊（推荐）</option><option value="precise">精确</option><option value="hidden">隐藏</option></select></label>
      <p>模糊模式由服务端转换为约 80 米网格区域，并移除高度、方向和速度；其他成员不会收到原始经纬度。</p>
    </PlaceholderPage>
  );
}
