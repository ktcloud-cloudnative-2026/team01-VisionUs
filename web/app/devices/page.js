'use client';
/**
 * 기기 현황 (대시보드) — 디자인 v8
 *  - GET /devices 를 3초마다 조회 (상태 갱신 방식: 주기적 조회)
 *  - 위쪽 요약 카드: 켜진 기기 · 전체 · 온라인 · 오프라인 대수 (목록에서 계산)
 *  - 조명·에어컨·난방기기·공기청정기: 카드를 누르면 상세 화면에서 제어 (켜진 기기는 블루 아이콘)
 *  - 커튼: 여기서 바로 열기/닫기, 엘리베이터: 여기서 바로 호출
 *  - 기기 등록: 오른쪽 위 + · 하단 탭 → 이 화면 위에 등록 창이 열림 (별도 페이지 없음)
 *      기기 종류는 아이콘 타일로 선택, 기기 ID 는 서버가 <종류>-<사용자ID>-<순번> 으로 자동 생성 (예: light-5-01)
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import TopBar from '../../components/TopBar';
import { CloudHomeIcon, DeviceIcon, LogoIcon, PlusIcon, PowerIcon, UnlinkIcon } from '../../components/Icons';
import { api, sendCommand, tokens, goLogin, currentUser } from '../../lib/api';
import { summary, TYPES } from '../../lib/devices';

const POLL_MS = 3000;

function CurtainActions({ device, onDone, onError }) {
  const [busy, setBusy] = useState(false);
  const run = async (command) => {
    setBusy(true);
    try { await sendCommand(device.deviceId, command); onDone(); } catch (e) { onError(e); } finally { setBusy(false); }
  };
  return (
    <div className="actions">
      <button className="gray" disabled={busy} onClick={() => run('OPEN')}>열기</button>
      <button className="gray" disabled={busy} onClick={() => run('CLOSE')}>닫기</button>
    </div>
  );
}

function ElevatorActions({ device, onDone, onError }) {
  const [floor, setFloor] = useState(1);
  const [busy, setBusy] = useState(false);
  const moving = device.state?.callStatus === 'arriving';
  const call = async () => {
    setBusy(true);
    try {
      await api('/elevator/calls', { method: 'POST', body: { deviceId: device.deviceId, floor: Number(floor) } });
      onDone();
    } catch (e) { onError(e); } finally { setBusy(false); }
  };
  return (
    <div className="actions">
      <input type="number" value={floor} onChange={(e) => setFloor(e.target.value)} aria-label="호출 층" />
      <button className="primary" disabled={busy || moving} onClick={call}>호출</button>
    </div>
  );
}

function DeviceCard({ d, onDone, onError }) {
  const offline = d.status !== 'online';
  const on = !offline && d.power === 'on';
  const cls = `card${on ? ' on' : ''}`;
  const body = (
    <>
      <span className="pic"><DeviceIcon type={d.type} /></span>
      <span className="corner" title={offline ? '오프라인' : on ? '켜짐' : ''}>
        {offline ? <UnlinkIcon /> : on ? <PowerIcon /> : null}
      </span>
      <span className="name">{d.name}</span>
      <span className="meta">
        {d.location || '-'}<i />
        {offline ? <span className="offline">오프라인 상태</span> : <span className={on ? 'on' : ''}>{summary(d)}</span>}
      </span>
    </>
  );
  // 커튼·엘리베이터는 카드 안에 버튼이 있어서 카드 전체를 링크로 만들지 않는다 (상세는 이름을 눌러 이동)
  if (d.type === 'curtain' || d.type === 'elevator') {
    return (
      <div className={cls}>
        <Link href={`/devices/${d.deviceId}`} style={{ display: 'contents' }}>{body}</Link>
        {d.type === 'curtain'
          ? <CurtainActions device={d} onDone={onDone} onError={onError} />
          : <ElevatorActions device={d} onDone={onDone} onError={onError} />}
      </div>
    );
  }
  return <Link href={`/devices/${d.deviceId}`} className={cls}>{body}</Link>;
}

// ---------------- 기기 등록 창 ----------------
function RegisterDialog({ onClose, onRegistered }) {
  const [type, setType] = useState('');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [location, setLocation] = useState('');
  const [userId, setUserId] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => setUserId(currentUser()?.id ?? null), []);
  // Esc 로 닫기
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const selected = TYPES.find((t) => t.value === type);

  // 종류를 고르면 이름을 직접 바꾸기 전까지 "<위치> <종류>" 로 채워 둔다
  function pick(value) {
    const t = TYPES.find((x) => x.value === value);
    setType(value);
    setErrors((e) => ({ ...e, type: undefined }));
    if (!nameTouched && t) setName(`${location ? `${location} ` : ''}${t.label}`);
  }
  function changeLocation(v) {
    setLocation(v);
    if (!nameTouched && selected) setName(`${v ? `${v} ` : ''}${selected.label}`);
  }

  async function submit(e) {
    e.preventDefault();
    const errs = {};
    if (!type) errs.type = '기기 종류를 선택하세요.';
    if (!name.trim()) errs.name = '기기 이름을 입력하세요.';
    setErrors(errs);
    setFormError('');
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      const d = await api('/devices', { method: 'POST', body: { type, name: name.trim(), location: location.trim() || null } });
      onRegistered(d);
    } catch (err) {
      if (err.details) setErrors(Object.fromEntries(err.details.map((x) => [x.field, x.message])));
      else setFormError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form className="sheet" onSubmit={submit} noValidate role="dialog" aria-modal="true" aria-labelledby="reg-title">
        <div className="grab" />
        <div className="head">
          <h2 id="reg-title">기기 등록</h2>
          <button type="button" className="close" onClick={onClose} disabled={busy} aria-label="닫기">✕</button>
        </div>
        <p className="hint">새 가전 기기를 내 계정에 연결합니다</p>

        <label id="reg-type-label">기기 종류</label>
        <div className={`type-grid${errors.type ? ' invalid' : ''}`} role="radiogroup" aria-labelledby="reg-type-label">
          {TYPES.map((t, i) => (
            <button key={t.value} type="button" role="radio" aria-checked={type === t.value}
              className={type === t.value ? 'selected' : ''} onClick={() => pick(t.value)} autoFocus={i === 0}>
              <DeviceIcon type={t.value} />{t.label}
            </button>
          ))}
        </div>
        {errors.type && <div className="field-error">{errors.type}</div>}

        <label htmlFor="reg-location">설치 위치</label>
        <input id="reg-location" placeholder="거실" value={location} onChange={(e) => changeLocation(e.target.value)} />
        {errors.location && <div className="field-error">{errors.location}</div>}

        <label htmlFor="reg-name">기기 이름</label>
        <input id="reg-name" placeholder="거실 조명" value={name} className={errors.name ? 'invalid' : ''}
          onChange={(e) => { setName(e.target.value); setNameTouched(true); }} />
        {errors.name && <div className="field-error">{errors.name}</div>}

        <label>기기 ID</label>
        <div className="auto-id">
          자동 생성 · {selected ? `${type}-${userId ?? '<사용자>'}-01` : '<종류>-<사용자>-<순번>'} 형식
        </div>

        {formError && <div className="form-error">{formError}</div>}
        <div className="row-btns">
          <button type="button" className="gray" onClick={onClose} disabled={busy}>취소</button>
          <button className="primary" type="submit" disabled={busy}>{busy ? '등록 중…' : '등록하기'}</button>
        </div>
      </form>
    </div>
  );
}

// ---------------- 기기 현황 ----------------
export default function DevicesPage() {
  const [devices, setDevices] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [registering, setRegistering] = useState(false);
  const [userName, setUserName] = useState('');

  const load = useCallback(async () => {
    try {
      setDevices(await api('/devices'));
    } catch (e) {
      if (e.status !== 401) setError(e.message);
    }
  }, []);

  useEffect(() => {
    if (!tokens.access) { goLogin(); return; }
    setUserName(currentUser()?.name ?? '');
    // 상세 화면의 하단 탭 "기기 등록"으로 들어오면 (/devices?register=1) 등록 창을 연다
    if (new URLSearchParams(window.location.search).get('register') === '1') {
      setRegistering(true);
      window.history.replaceState(null, '', '/devices');
    }
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const onError = (e) => setError(e.message);
  const openRegister = useCallback(() => setRegistering(true), []);
  const closeRegister = useCallback(() => setRegistering(false), []);
  const onRegistered = (d) => {
    setRegistering(false);
    setNotice(`등록되었습니다 · ${d.name} (기기 ID: ${d.deviceId})`);
    load();
  };

  // 요약 카드 숫자 (목록에서 계산)
  const total = devices?.length;
  const online = devices?.filter((d) => d.status === 'online').length;
  const poweredOn = devices?.filter((d) => d.status === 'online' && d.power === 'on').length;
  const n = (v) => (v ?? '-');

  return (
    <>
      <main className="page">
        <div className="topbar">
          <span className="home">홈</span>
          <button type="button" className="plus-btn" onClick={openRegister} aria-label="기기 등록"><PlusIcon /></button>
        </div>

        <section className="summary" aria-label="우리 집 요약">
          <div className="main"><CloudHomeIcon /><b>{n(poweredOn)}<small>대 켜짐</small></b></div>
          <div className="stats">
            <div><b>{n(total)}대</b><span>전체 기기</span></div>
            <div><b>{n(online)}대</b><span>온라인</span></div>
            <div><b>{total === undefined ? '-' : total - online}대</b><span>오프라인</span></div>
          </div>
        </section>

        <div className="list-head"><b>모든 기기</b><span>{userName ? `${userName}님` : ''}</span></div>

        {error && <div className="error-bar" onClick={() => setError('')}>{error}</div>}
        {notice && <div className="error-bar ok" onClick={() => setNotice('')}>{notice}</div>}

        {devices === null ? <p className="hint" style={{ margin: '0 4px' }}>불러오는 중…</p> : devices.length === 0 ? (
          <div className="empty">
            <div className="logo lg"><LogoIcon /></div>
            <p className="title">등록된 기기가 없습니다.</p>
            <p className="hint">오른쪽 위 + 버튼으로 기기를 등록하세요</p>
            <button className="primary" onClick={openRegister}>기기 등록하기</button>
          </div>
        ) : (
          <div className="grid">
            {devices.map((d) => <DeviceCard key={d.deviceId} d={d} onDone={load} onError={onError} />)}
          </div>
        )}
      </main>
      <TopBar onRegister={openRegister} />
      {registering && <RegisterDialog onClose={closeRegister} onRegistered={onRegistered} />}
    </>
  );
}
