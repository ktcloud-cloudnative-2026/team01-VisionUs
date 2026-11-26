'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { tokens } from '../lib/api';
import { LogoIcon } from '../components/Icons';

// 시작 화면: 로그인 여부를 확인하는 동안 로고를 보여주고 바로 이동한다
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(tokens.access ? '/devices' : '/login');
  }, [router]);
  return (
    <main className="splash">
      <div className="logo lg"><LogoIcon /></div>
      <b>Home IoT</b>
      <p className="hint">우리 집 가전을 한 곳에서</p>
    </main>
  );
}
