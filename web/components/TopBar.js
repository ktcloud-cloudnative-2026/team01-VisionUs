'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, currentUser, tokens, goLogin } from '../lib/api';

export default function TopBar() {
  const [user, setUser] = useState(null);
  useEffect(() => setUser(currentUser()), []);

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST', body: { refreshToken: tokens.refresh } });
    } catch { /* 토큰이 이미 만료돼도 로그아웃은 진행 */ }
    goLogin();
  }

  return (
    <header className="topbar">
      <Link href="/devices" className="brand">Home IoT</Link>
      <div className="right">
        <span>{user?.name ?? ''}</span>
        <button onClick={logout}>로그아웃</button>
      </div>
    </header>
  );
}
