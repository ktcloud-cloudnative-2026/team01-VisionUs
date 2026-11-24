import './globals.css';

export const metadata = {
  title: 'Home IoT',
  description: '가정 전자기기 IoT 연동 시스템',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
