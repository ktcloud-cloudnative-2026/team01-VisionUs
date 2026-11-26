/**
 * 아이콘 모음 (디자인 v8)
 *  - DeviceIcon type="light" 처럼 기기 종류로 아이콘을 고른다
 *  - 색은 currentColor 를 따르므로 부모의 color 로 바꾼다
 */
const line = (paths, width = 1.7) => function Icon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {paths}
    </svg>
  );
};

export const LightIcon = line(<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />);
export const AirconIcon = line(<><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M9.5 6h5M9.5 8.5h5M9.5 11h5M10 18.5h4" /></>);
export const HeaterIcon = line(<><rect x="4" y="6" width="16" height="13" rx="2.5" /><path d="M8 6v13M12 6v13M16 6v13M6 19v2M18 19v2" /></>);
export const PurifierIcon = line(<><rect x="6.5" y="3" width="11" height="18" rx="2.5" /><circle cx="12" cy="9.5" r="3" /><path d="M9.5 16h5M9.5 18h5" /></>);
export const CurtainIcon = line(<path d="M3 4h18M5 4v16M19 4v16M5 4c0 6 3 11 4 16H5M19 4c0 6-3 11-4 16h4" />);
export const ElevatorIcon = line(<><rect x="5" y="3" width="14" height="18" rx="1.5" /><path d="M12 3v18M7.5 8l1.5-1.5L10.5 8M16.5 6.5L15 8l-1.5-1.5" /></>);
export const PlusIcon = line(<path d="M12 5.5v13M5.5 12h13" />, 2.6);
export const BackIcon = line(<path d="M15 5l-7 7 7 7" />, 2);
export const TrashIcon = line(<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />);
export const PowerIcon = line(<path d="M12 3.5v7M6.6 7a7.5 7.5 0 1 0 10.8 0" />, 2);
export const UnlinkIcon = line(<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /><path d="M4 4l16 16" /></>, 1.6);
export const AddBoxIcon = line(<><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8.5v7M8.5 12h7" /></>);
export const UserIcon = line(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="10" r="3" /><path d="M6.5 18.5c1.3-2.3 3.3-3.5 5.5-3.5s4.2 1.2 5.5 3.5" /></>);
export const LogoIcon = line(<><path d="M4 11.5L12 5l8 6.5" /><path d="M6.5 10v9h11v-9" /><path d="M10 15.2a2.8 2.8 0 0 1 4 0M8.6 13.4a4.8 4.8 0 0 1 6.8 0" /><circle cx="12" cy="17" r=".6" /></>, 1.8);

// 하단 탭의 "기기 현황" (채워진 집 모양)
export function HomeFillIcon(props) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...props}><path d="M3 11.2L12 3.5l9 7.7V21h-6.2v-6H9.2v6H3z" fill="currentColor" /></svg>;
}
// 상단 요약 카드의 구름 + 집 그림
export function CloudHomeIcon(props) {
  return (
    <svg viewBox="0 0 50 40" aria-hidden="true" {...props}>
      <path d="M12 34h28a9 9 0 0 0 0-18 12 12 0 0 0-23-3A10 10 0 0 0 12 34z" fill="#fff" />
      <path d="M20 27l6-5 6 5M22 25.5V31h8v-5.5" fill="none" stroke="#b9bfdc" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const BY_TYPE = {
  light: LightIcon, aircon: AirconIcon, heater: HeaterIcon,
  purifier: PurifierIcon, curtain: CurtainIcon, elevator: ElevatorIcon,
};

export function DeviceIcon({ type, ...props }) {
  const Icon = BY_TYPE[type] ?? LogoIcon;
  return <Icon {...props} />;
}
