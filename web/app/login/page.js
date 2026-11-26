'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, tokens } from '../../lib/api';
import { LogoIcon } from '../../components/Icons';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  // 토큰이 이미 있으면 기기 현황으로 바로 이동
  useEffect(() => { if (tokens.access) router.replace('/devices'); }, [router]);

  async function submit(e) {
    e.preventDefault();
    const errs = {};
    if (!form.email) errs.email = '이메일을 입력하세요.';
    else if (!EMAIL_RE.test(form.email)) errs.email = '이메일 형식이 올바르지 않습니다.';
    if (!form.password) errs.password = '비밀번호를 입력하세요.';
    setErrors(errs);
    setFormError('');
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      const data = await api('/auth/login', { method: 'POST', body: form, auth: false });
      tokens.save(data);
      router.replace('/devices');
    } catch {
      setFormError('이메일 또는 비밀번호를 확인하세요');
    } finally {
      setBusy(false);
    }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <main className="auth-wrap">
      <form className="auth-card" onSubmit={submit} noValidate>
        <div className="logo"><LogoIcon /></div>
        <h1>Home IoT</h1>
        <p className="hint">로그인 후 가전 기기를 제어합니다</p>

        <label htmlFor="email">이메일</label>
        <input id="email" type="email" placeholder="user@example.com" value={form.email} onChange={set('email')}
          autoComplete="email" className={errors.email ? 'invalid' : ''} />
        {errors.email && <div className="field-error">{errors.email}</div>}

        <label htmlFor="password">비밀번호</label>
        <input id="password" type="password" placeholder="********" value={form.password} onChange={set('password')}
          autoComplete="current-password" className={errors.password ? 'invalid' : ''} />
        {errors.password && <div className="field-error">{errors.password}</div>}

        {formError && <div className="form-error">{formError}</div>}

        <div className="stack">
          <button className="primary" type="submit" disabled={busy}>{busy ? '로그인 중…' : '로그인'}</button>
          <Link href="/signup"><button type="button" style={{ width: '100%' }}>회원가입</button></Link>
        </div>
      </form>
    </main>
  );
}
