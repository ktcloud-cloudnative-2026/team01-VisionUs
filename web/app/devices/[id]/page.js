'use client';
/**
 * 기기 상세 · 제어 — 디자인 v8
 *  - GET /devices/{id} 3초 주기 조회, 화면 상태는 기기가 보고한 값 기준
 *  - POST /devices/{id}/commands : 요청 중에는 버튼 비활성화, 실패하면 오류 표시
 *  - 최근 이벤트 (GET /devices/{id}/events)
 *  - 위쪽 기기 카드(아이콘 · 현재 상태) + 아래 흰 카드 줄(전원 토글 · −/+ 와 막대 · 모드 선택)
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import TopBar from '../../../components/TopBar';
import { BackIcon, DeviceIcon, TrashIcon } from '../../../components/Icons';
import { api, sendCommand, tokens, goLogin } from '../../../lib/api';
import { FAN, MODE, summary, typeInfo } from '../../../lib/devices';

const POLL_MS = 3000;
const TEMP_RANGE = { aircon: [16, 30], heater: [15, 30] };
const EVENT_LABEL = { STATE_CHANGED: '상태 변경', COMMAND_SENT: '명령 발행', ONLINE: '온라인', OFFLINE: '오프라인' };

// −/+ 버튼과 값, 아래 막대 (min~max 범위에서 현재 위치)
function StepRow({ title, hint, value, unit, min, max, disabled, onMinus, onPlus }) {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return (
    <div className="row-card">
      <div className="rh"><b>{title}</b><small>{hint}</small></div>
      <div className="stepper">
        <button disabled={disabled} onClick={onMinus} aria-label={`${title} 낮추기`}>−</button>
        <span className="value">{value ?? '-'}<small>{unit}</small></span>
        <button disabled={disabled} onClick={onPlus} aria-label={`${title} 높이기`}>+</button>
      </div>
      <div className="bar"><i style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function SegRow({ title, items, selected, disabled, onPick }) {
  return (
    <div className="row-card">
      <div className="rh"><b>{title}</b></div>
      <div className="seg" role="group" aria-label={title} style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map(([key, label]) => (
          <button key={key} className={selected === key ? 'selected' : ''} aria-pressed={selected === key}
            disabled={disabled} onClick={() => onPick(key)}>{label}</button>
        ))}
      </div>
    </div>
  );
}

export default function DeviceDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [device, setDevice] = useState(null);
  const [events, setEvents] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [d, ev] = await Promise.all([
        api(`/devices/${encodeURIComponent(id)}`),
        api(`/devices/${encodeURIComponent(id)}/events?limit=10`).catch(() => []),
      ]);
      setDevice(d);
      setEvents(ev);
    } catch (e) {
      if (e.status === 404 || e.status === 403) router.replace('/devices');
      else if (e.status !== 401) setError(e.message);
    }
  }, [id, router]);

  useEffect(() => {
    if (!tokens.access) { goLogin(); return; }
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  async function run(command, params) {
    setBusy(true);
    setError('');
    try {
      await sendCommand(id, command, params);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm('이 기기를 삭제할까요?')) return;
    try {
      await api(`/devices/${encodeURIComponent(id)}`, { method: 'DELETE' });
      router.replace('/devices');
    } catch (e) { setError(e.message); }
  }

  if (!device) {
    return (<><main className="page narrow"><p className="hint" style={{ textAlign: 'center', marginTop: 40 }}>{error || '불러오는 중…'}</p></main><TopBar /></>);
  }

  const s = device.state ?? {};
  const info = typeInfo(device.type);
  const online = device.status === 'online';
  const disabled = busy || !online;
  const isOn = device.power === 'on';
  const hasPower = ['light', 'aircon', 'heater', 'purifier'].includes(device.type);

  // 전원: 토글 스위치 하나로 SET_POWER on|off (원본의 켜기/끄기 버튼과 같은 명령)
  const powerRow = (
    <div className="row-card">
      <div className="rh">
        <b>전원</b>
        <button className={`switch${isOn ? ' on' : ''}`} role="switch" aria-checked={isOn} aria-label="전원"
          disabled={disabled} onClick={() => run('SET_POWER', { power: isOn ? 'off' : 'on' })} />
      </div>
    </div>
  );

  let controls = null;
  if (device.type === 'light') {
    controls = (<>
      {powerRow}
      <StepRow title="밝기" hint="10% 씩 조절" value={s.brightness} unit="%" min={0} max={100} disabled={disabled}
        onMinus={() => run('SET_BRIGHTNESS', { brightness: Math.max(0, s.brightness - 10) })}
        onPlus={() => run('SET_BRIGHTNESS', { brightness: Math.min(100, s.brightness + 10) })} />
    </>);
  } else if (device.type === 'aircon' || device.type === 'heater') {
    const [min, max] = TEMP_RANGE[device.type];
    controls = (<>
      {powerRow}
      <StepRow title="희망 온도" hint={`${min} ~ ${max}℃`} value={s.temperature} unit="℃" min={min} max={max} disabled={disabled}
        onMinus={() => run('SET_TEMPERATURE', { temperature: Math.max(min, s.temperature - 1) })}
        onPlus={() => run('SET_TEMPERATURE', { temperature: Math.min(max, s.temperature + 1) })} />
      {device.type === 'aircon' && (
        <SegRow title="운전 모드" items={Object.entries(MODE)} selected={s.mode} disabled={disabled}
          onPick={(k) => run('SET_MODE', { mode: k })} />
      )}
    </>);
  } else if (device.type === 'purifier') {
    controls = (<>
      {powerRow}
      <SegRow title="풍량" items={['low', 'mid', 'high', 'auto'].map((k) => [k, FAN[k]])} selected={s.fanSpeed} disabled={disabled}
        onPick={(k) => run('SET_FAN_SPEED', { fanSpeed: k })} />
    </>);
  } else if (device.type === 'curtain') {
    controls = (<>
      <div className="row-card">
        <div className="rh"><b>열기 / 닫기</b></div>
        <div className="two-btns">
          <button className="gray" disabled={disabled} onClick={() => run('OPEN')}>열기</button>
          <button className="gray" disabled={disabled} onClick={() => run('CLOSE')}>닫기</button>
        </div>
      </div>
      <StepRow title="개폐 정도" hint="0 = 닫힘 · 100 = 열림" value={s.position} unit="%" min={0} max={100} disabled={disabled}
        onMinus={() => run('SET_POSITION', { position: Math.max(0, s.position - 10) })}
        onPlus={() => run('SET_POSITION', { position: Math.min(100, s.position + 10) })} />
    </>);
  } else if (device.type === 'elevator') {
    // API 에 건물 최고 층수가 없으므로, 호출한 층(targetFloor)과 현재 층 중 큰 값을 막대 끝으로 쓴다
    const cur = s.currentFloor ?? 1;
    const top = Math.max(2, cur, s.targetFloor ?? 0);
    const pct = ((cur - 1) / (top - 1)) * 100;
    controls = (
      <div className="row-card">
        <div className="rh"><b>호출</b><small>기기 현황 화면에서 합니다</small></div>
        <div className="bar" style={{ height: 8 }}><i style={{ width: `${pct}%` }} /></div>
        <div className="bar-labels"><span>1층</span><span>현재 {cur}층</span><span>{top}층</span></div>
      </div>
    );
  }

  return (
    <>
      <main className="page narrow">
        <div className="titlebar">
          <Link href="/devices" className="icon-btn" aria-label="기기 현황으로"><BackIcon /></Link>
          <h1>{device.name}</h1>
          <button className="icon-btn danger" onClick={remove} aria-label="기기 삭제" title="기기 삭제"><TrashIcon /></button>
        </div>

        {error && <div className="error-bar">{error}</div>}
        {!online && <div className="error-bar">기기가 오프라인이라 제어할 수 없습니다. 시뮬레이터 연결을 확인하세요.</div>}

        <section className={`product${hasPower && isOn && online ? ' on' : ''}`}>
          <div className="pic"><DeviceIcon type={device.type} /></div>
          <div className="state">{summary(device)}</div>
          <div className="meta">
            {info.label} · {device.location || '-'} · {device.deviceId} ·{' '}
            {online ? <span className="online">온라인</span> : <span className="offline">오프라인</span>}
          </div>
        </section>

        <div className={`controls${online ? '' : ' disabled'}`}>{controls}</div>

        <section className="row-card">
          <div className="rh"><b>최근 이벤트</b></div>
          {events.length === 0 ? <p className="hint" style={{ marginTop: 8 }}>이벤트가 없습니다.</p> : (
            <ul className="events">
              {events.map((e) => (
                <li key={e.eventId}>
                  <time>{new Date(e.occurredAt).toLocaleTimeString('ko-KR', { hour12: false })}</time>
                  <span>{EVENT_LABEL[e.type] ?? e.type}</span>
                  <span className="cmd">{e.type === 'COMMAND_SENT' ? e.payload.command : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <TopBar />
    </>
  );
}
