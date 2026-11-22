'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const errs = {};
    if (!form.name.trim()) errs.name = '이름을 입력하세요.';
    if (!EMAIL_RE.test(form.email)) errs.email = '이메일 형식이 올바르지 않습니다.';
    if (form.password.length < 8) errs.password = '비밀번호는 8자 이상이어야 합니다.';
    if (form.password !== form.confirm) errs.confirm = '비밀번호가 일치하지 않습니다.';
    setErrors(errs);
    setFormError('');
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      await api('/auth/signup', { method: 'POST', body: { name: form.name, email: form.email, password: form.password }, auth: false });
      alert('가입이 완료되었습니다. 로그인하세요.');
      router.replace('/login');
    } catch (err) {
      if (err.status === 409) setErrors({ email: '이미 가입된 이메일입니다.' });
      else if (err.details) setErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
      else setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const field = (key, label, type, placeholder, auto) => (
    <>
      <label htmlFor={key}>{label}</label>
      <input id={key} type={type} placeholder={placeholder} value={form[key]} onChange={set(key)} autoComplete={auto} />
      {errors[key] && <div className="field-error">{errors[key]}</div>}
    </>
  );

  return (
    <main className="auth-wrap">
      <form className="auth-card" onSubmit={submit} noValidate>
        <div className="logo">회원가입</div>
        <p className="sub">계정을 만들고 가전 기기를 연결합니다</p>
        {field('name', '이름', 'text', '이름', 'name')}
        {field('email', '이메일', 'email', 'user@example.com', 'email')}
        {field('password', '비밀번호', 'password', '********', 'new-password')}
        {field('confirm', '비밀번호 확인', 'password', '********', 'new-password')}
        {formError && <div className="form-error">{formError}</div>}
        <div className="stack">
          <button className="primary" type="submit" disabled={busy}>{busy ? '처리 중…' : '가입하기'}</button>
          <Link href="/login" style={{ textAlign: 'center', fontSize: 14 }}>로그인으로 돌아가기</Link>
        </div>
      </form>
    </main>
  );
}
