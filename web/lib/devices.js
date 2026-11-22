export const TYPES = [
  { value: 'light', label: '조명', icon: '💡' },
  { value: 'aircon', label: '에어컨', icon: '❄️' },
  { value: 'heater', label: '난방기기', icon: '🔥' },
  { value: 'purifier', label: '공기청정기', icon: '🌀' },
  { value: 'curtain', label: '커튼', icon: '🪟' },
  { value: 'elevator', label: '엘리베이터 호출', icon: '🛗' },
];

export const typeInfo = (type) => TYPES.find((t) => t.value === type) ?? { label: type, icon: '•' };

export const FAN = { low: '약', mid: '중', high: '강', auto: '자동' };
export const MODE = { cool: '냉방', dry: '제습', fan: '송풍' };

/** 대시보드 카드에 보여줄 한 줄 상태 (와이어프레임 기준) */
export function summary(d) {
  const s = d.state ?? {};
  const p = d.power === 'on' ? '켜짐' : '꺼짐';
  switch (d.type) {
    case 'light': return d.power === 'on' ? `켜짐 · 밝기 ${s.brightness}%` : '꺼짐';
    case 'aircon': return `${p} · 희망 ${s.temperature}℃`;
    case 'heater': return `${p} · 희망 ${s.temperature}℃`;
    case 'purifier': return d.power === 'on' ? `켜짐 · 풍량 ${FAN[s.fanSpeed] ?? s.fanSpeed}` : '꺼짐';
    case 'curtain': return s.position > 0 ? `열림 ${s.position}%` : '닫힘';
    case 'elevator':
      if (s.callStatus === 'arriving') return `${s.targetFloor}층으로 이동 중 · 현재 ${s.currentFloor}층`;
      if (s.callStatus === 'arrived') return `도착 · ${s.currentFloor}층`;
      return `대기 중 · 현재 층 ${s.currentFloor ?? '-'}층`;
    default: return '';
  }
}
