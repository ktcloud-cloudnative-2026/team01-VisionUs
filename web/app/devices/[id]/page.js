'use client';
/**
 * 기기 상세 · 제어
 *  - GET /devices/{id} 3초 주기 조회, 화면 상태는 기기가 보고한 값 기준
 *  - POST /devices/{id}/commands : 요청 중에는 버튼 비활성화, 실패하면 오류 표시
 *  - 최근 이벤트 (GET /devices/{id}/events)
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import TopBar from '../../../components/TopBar';
import { api, sendCommand, tokens, goLogin } from '../../../lib/api';
import { FAN, MODE, summary, typeInfo } from '../../../lib/devices';

const POLL_MS = 3000;
const TEMP_RANGE = { aircon: [16, 30], heater: [15, 30] };
const EVENT_LABEL = { STATE_CHANGED: '상태 변경', COMMAND_SENT: '명령 발행', ONLINE: '온라인', OFFLINE: '오프라인' };

function Stepper({ value, unit, onMinus, onPlus, disabled }) {
  return (
    <div className="btns">
      <button disabled={disabled} onClick={onMinus} aria-label="감소">−</button>
      <span className="value">{value}{unit}</span>
      <button disabled={disabled} onClick={onPlus} aria-label="증가">+</button>
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
    return (<><TopBar /><main className="page"><p className="hint">{error || '불러오는 중…'}</p></main></>);
  }

  const s = device.state ?? {};
  const info = typeInfo(device.type);
  const disabled = busy || device.status !== 'online';
  const powerRow = (
    <div className="ctrl-row">
      <span>전원</span>
      <div className="btns">
        <button className={device.power === 'on' ? 'selected' : ''} disabled={disabled} onClick={() => run('SET_POWER', { power: 'on' })}>켜기</button>
        <button className={device.power === 'off' ? 'selected' : ''} disabled={disabled} onClick={() => run('SET_POWER', { power: 'off' })}>끄기</button>
      </div>
    </div>
  );

  let controls = null;
  if (device.type === 'light') {
    controls = (<>
      {powerRow}
      <div className="ctrl-row">
        <span>밝기</span>
        <Stepper value={s.brightness} unit="%" disabled={disabled}
          onMinus={() => run('SET_BRIGHTNESS', { brightness: Math.max(0, s.brightness - 10) })}
          onPlus={() => run('SET_BRIGHTNESS', { brightness: Math.min(100, s.brightness + 10) })} />
      </div>
    </>);
  } else if (device.type === 'aircon' || device.type === 'heater') {
    const [min, max] = TEMP_RANGE[device.type];
    controls = (<>
      {powerRow}
      <div className="ctrl-row">
        <span>희망 온도</span>
        <Stepper value={s.temperature} unit="℃" disabled={disabled}
          onMinus={() => run('SET_TEMPERATURE', { temperature: Math.max(min, s.temperature - 1) })}
          onPlus={() => run('SET_TEMPERATURE', { temperature: Math.min(max, s.temperature + 1) })} />
      </div>
      {device.type === 'aircon' && (
        <div className="ctrl-row">
          <span>운전 모드</span>
          <div className="btns">
            {Object.entries(MODE).map(([k, label]) => (
              <button key={k} className={s.mode === k ? 'selected' : ''} disabled={disabled} onClick={() => run('SET_MODE', { mode: k })}>{label}</button>
            ))}
          </div>
        </div>
      )}
    </>);
  } else if (device.type === 'purifier') {
    controls = (<>
      {powerRow}
      <div className="ctrl-row">
        <span>풍량</span>
        <div className="btns">
          {['low', 'mid', 'high', 'auto'].map((k) => (
            <button key={k} className={s.fanSpeed === k ? 'selected' : ''} disabled={disabled} onClick={() => run('SET_FAN_SPEED', { fanSpeed: k })}>{FAN[k]}</button>
          ))}
        </div>
      </div>
    </>);
  } else if (device.type === 'curtain') {
    controls = (<>
      <div className="ctrl-row">
        <span>열기 / 닫기</span>
        <div className="btns">
          <button disabled={disabled} onClick={() => run('OPEN')}>열기</button>
          <button disabled={disabled} onClick={() => run('CLOSE')}>닫기</button>
        </div>
      </div>
      <div className="ctrl-row">
        <span>개폐 정도</span>
        <Stepper value={s.position} unit="%" disabled={disabled}
          onMinus={() => run('SET_POSITION', { position: Math.max(0, s.position - 10) })}
          onPlus={() => run('SET_POSITION', { position: Math.min(100, s.position + 10) })} />
      </div>
    </>);
  } else if (device.type === 'elevator') {
    controls = <p className="hint">엘리베이터 호출은 기기 현황 화면에서 합니다.</p>;
  }

  return (
    <>
      <TopBar />
      <main className="page" style={{ maxWidth: 640 }}>
        <div className="page-head">
          <div>
            <Link href="/devices">← 기기 현황</Link>
            <h1 style={{ marginTop: 8 }}>{info.icon} {device.name}</h1>
            <p className="hint">{info.label}{device.location ? ` · ${device.location}` : ''} · {device.deviceId}</p>
          </div>
          <span className={`pill ${device.status}`}>{device.status === 'online' ? '온라인' : '오프라인'}</span>
        </div>

        {error && <div className="error-bar">{error}</div>}
        {device.status !== 'online' && <div className="error-bar">기기가 오프라인이라 제어할 수 없습니다. 시뮬레이터 연결을 확인하세요.</div>}

        <section className="panel">
          <h2>현재 상태</h2>
          <div className="big">{summary(device)}</div>
        </section>

        <section className="panel">
          <h2>제어</h2>
          {controls}
        </section>

        <section className="panel">
          <h2>최근 이벤트</h2>
          {events.length === 0 ? <p className="hint">이벤트가 없습니다.</p> : (
            <ul className="events">
              {events.map((e) => (
                <li key={e.eventId}>
                  <time>{new Date(e.occurredAt).toLocaleTimeString('ko-KR', { hour12: false })}</time>
                  <span>{EVENT_LABEL[e.type] ?? e.type}</span>
                  <span className="hint" style={{ margin: 0 }}>{e.type === 'COMMAND_SENT' ? e.payload.command : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <button onClick={remove} style={{ color: 'var(--bad)' }}>기기 삭제</button>
      </main>
    </>
  );
}
