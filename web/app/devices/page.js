'use client';
/**
 * 기기 현황 (대시보드)
 *  - GET /devices 를 3초마다 조회 (상태 갱신 방식: 주기적 조회)
 *  - 조명·에어컨·난방기기·공기청정기: 카드 → 상세 화면에서 제어
 *  - 커튼: 여기서 바로 열기/닫기, 엘리베이터: 여기서 바로 호출
 *  - 기기 등록: "+ 기기 등록" 을 누르면 이 화면 위에 등록 창이 열림 (별도 페이지 없음)
 *      기기 종류는 드롭다운, 기기 ID 는 서버가 <종류>-<사용자ID>-<순번> 으로 자동 생성 (예: light-5-01)
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import TopBar from '../../components/TopBar';
import { api, sendCommand, tokens, goLogin, currentUser } from '../../lib/api';
import { summary, typeInfo, TYPES } from '../../lib/devices';

const POLL_MS = 3000;

function CurtainActions({ device, onDone, onError }) {
  const [busy, setBusy] = useState(false);
  const run = async (command) => {
    setBusy(true);
    try { await sendCommand(device.deviceId, command); onDone(); } catch (e) { onError(e); } finally { setBusy(false); }
  };
  return (
    <div className="actions">
      <button disabled={busy} onClick={() => run('OPEN')}>열기</button>
      <button disabled={busy} onClick={() => run('CLOSE')}>닫기</button>
      <Link href={`/devices/${device.deviceId}`} style={{ marginLeft: 'auto', fontSize: 14 }}>상세 보기 →</Link>
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
      <input type="number" value={floor} onChange={(e) => setFloor(e.target.value)} style={{ width: 80 }} aria-label="호출 층" />
      <span className="meta">층</span>
      <button className="primary" disabled={busy || moving} onClick={call}>호출</button>
    </div>
  );
}

// ---------------- 기기 등록 창 ----------------
const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(17, 24, 39, .45)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 50 },
  dialog: { width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', margin: 0 },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  close: { border: 0, background: 'transparent', fontSize: 22, padding: '0 4px', lineHeight: 1 },
  autoId: { padding: '10px 12px', border: '1px dashed var(--line)', borderRadius: 8, color: 'var(--muted)', fontSize: 14, background: '#fafbfc' },
};

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
    <div style={S.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form className="panel" style={S.dialog} onSubmit={submit} noValidate role="dialog" aria-modal="true" aria-labelledby="reg-title">
        <div style={S.head}>
          <h2 id="reg-title" style={{ margin: 0, fontSize: 18, color: 'var(--text)' }}>기기 등록</h2>
          <button type="button" style={S.close} onClick={onClose} disabled={busy} aria-label="닫기">×</button>
        </div>
        <p className="hint">새 가전 기기를 내 계정에 연결합니다</p>

        <label htmlFor="reg-type">기기 종류</label>
        <select id="reg-type" value={type} onChange={(e) => pick(e.target.value)} autoFocus>
          <option value="" disabled>기기 종류를 선택하세요</option>
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
        </select>
        {errors.type && <div className="field-error">{errors.type}</div>}

        <label htmlFor="reg-location">설치 위치</label>
        <input id="reg-location" placeholder="거실" value={location} onChange={(e) => changeLocation(e.target.value)} />
        {errors.location && <div className="field-error">{errors.location}</div>}

        <label htmlFor="reg-name">기기 이름</label>
        <input id="reg-name" placeholder="거실 조명" value={name}
          onChange={(e) => { setName(e.target.value); setNameTouched(true); }} />
        {errors.name && <div className="field-error">{errors.name}</div>}

        <label>기기 ID</label>
        <div style={S.autoId}>
          자동 생성 · {selected ? `${type}-${userId ?? '<사용자>'}-01` : '<종류>-<사용자>-<순번>'} 형식
        </div>

        {formError && <div className="form-error">{formError}</div>}
        <div className="stack">
          <button className="primary" type="submit" disabled={busy}>{busy ? '등록 중…' : '등록하기'}</button>
          <button type="button" onClick={onClose} disabled={busy}>취소</button>
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

  const load = useCallback(async () => {
    try {
      setDevices(await api('/devices'));
    } catch (e) {
      if (e.status !== 401) setError(e.message);
    }
  }, []);

  useEffect(() => {
    if (!tokens.access) { goLogin(); return; }
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const onError = (e) => setError(e.message);
  const closeRegister = useCallback(() => setRegistering(false), []);
  const onRegistered = (d) => {
    setRegistering(false);
    setNotice(`등록되었습니다 · ${d.name} (기기 ID: ${d.deviceId})`);
    load();
  };

  return (
    <>
      <TopBar />
      <main className="page">
        <div className="page-head">
          <div>
            <h1>기기 현황</h1>
            <p className="hint">커튼·엘리베이터는 여기서 바로 제어하고, 나머지는 상세 화면에서 제어해요</p>
          </div>
          <button className="primary" onClick={() => setRegistering(true)}>+ 기기 등록</button>
        </div>

        {error && <div className="error-bar" onClick={() => setError('')}>{error}</div>}
        {notice && (
          <div className="error-bar" style={{ background: '#e3f6ea', color: 'var(--ok)' }} onClick={() => setNotice('')}>{notice}</div>
        )}

        {devices === null ? <p className="hint">불러오는 중…</p> : devices.length === 0 ? (
          <div className="empty">
            <p>등록된 기기가 없습니다.</p>
            <button className="primary" onClick={() => setRegistering(true)}>기기 등록하기</button>
          </div>
        ) : (
          <div className="grid">
            {devices.map((d) => {
              const info = typeInfo(d.type);
              return (
                <div className="card" key={d.deviceId}>
                  <div className="head">
                    <span className="name">{info.icon} {d.name}</span>
                    <span className={`pill ${d.status}`}>{d.status === 'online' ? '온라인' : '오프라인'}</span>
                  </div>
                  <div className="meta">{info.label}{d.location ? ` · ${d.location}` : ''}</div>
                  <div className="status">{summary(d)}</div>
                  {d.type === 'curtain' ? <CurtainActions device={d} onDone={load} onError={onError} />
                    : d.type === 'elevator' ? <ElevatorActions device={d} onDone={load} onError={onError} />
                    : (
                      <div className="actions">
                        <Link href={`/devices/${d.deviceId}`} style={{ marginLeft: 'auto', fontSize: 14 }}>상세 보기 →</Link>
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        )}
      </main>
      {registering && <RegisterDialog onClose={closeRegister} onRegistered={onRegistered} />}
    </>
  );
}
