'use client';
/**
 * 하단 탭 바 (디자인 v8) — 기존 상단 바(TopBar)를 대신한다
 *  - 기기 현황 / 기기 등록 / 로그아웃
 *  - onRegister 를 넘기면 "기기 등록"이 그 함수를 부르고,
 *    없으면 /devices?register=1 로 이동해서 기기 현황 화면이 등록 창을 연다
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api, tokens, goLogin } from '../lib/api';
import { AddBoxIcon, HomeFillIcon, UserIcon } from './Icons';

export default function TopBar({ onRegister }) {
  const pathname = usePathname();

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST', body: { refreshToken: tokens.refresh } });
    } catch { /* 토큰이 이미 만료돼도 로그아웃은 진행 */ }
    goLogin();
  }

  return (
    <nav className="tabbar" aria-label="주 메뉴">
      <div className="inner">
        <Link href="/devices" className={pathname?.startsWith('/devices') ? 'on' : ''}><HomeFillIcon />기기 현황</Link>
        {onRegister
          ? <button type="button" onClick={onRegister}><AddBoxIcon />기기 등록</button>
          : <Link href="/devices?register=1"><AddBoxIcon />기기 등록</Link>}
        <button type="button" onClick={logout}><UserIcon />로그아웃</button>
      </div>
    </nav>
  );
}
