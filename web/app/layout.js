import './globals.css';

export const metadata = {
  title: 'Home IoT',
  description: '가정 전자기기 IoT 연동 시스템',
};

// 휴대폰에서도 화면 폭에 맞게 보이도록 (디자인 v8 은 모바일 우선)
export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
