'use strict';
/**
 * MQTT 토픽 규약 (API 명세서 5절)
 *   home/{homeId}/devices/{deviceId}/command   백엔드 → 기기   제어 명령
 *   home/{homeId}/devices/{deviceId}/state     기기 → 백엔드   상태 변경 / 명령 결과
 *   home/{homeId}/devices/{deviceId}/status    기기 → 백엔드   online / offline
 *   home/{homeId}/elevator/call                백엔드 → 기기   엘리베이터 호출
 *   home/{homeId}/elevator/status              기기 → 백엔드   호출 진행 상태
 * 추가(구현 보완):
 *   home/{homeId}/devices/{deviceId}/meta      백엔드 → 기기   등록 정보 (retained). 시뮬레이터가 이걸 보고 가상 기기를 만든다
 *
 * homeId 는 기기 소유 사용자 ID(users.user_id)를 쓴다.
 */
const t = {
  command: (homeId, deviceId) => `home/${homeId}/devices/${deviceId}/command`,
  state: (homeId, deviceId) => `home/${homeId}/devices/${deviceId}/state`,
  status: (homeId, deviceId) => `home/${homeId}/devices/${deviceId}/status`,
  meta: (homeId, deviceId) => `home/${homeId}/devices/${deviceId}/meta`,
  elevatorCall: (homeId) => `home/${homeId}/elevator/call`,
  elevatorStatus: (homeId) => `home/${homeId}/elevator/status`,
};

const ALL = {
  command: 'home/+/devices/+/command',
  state: 'home/+/devices/+/state',
  status: 'home/+/devices/+/status',
  meta: 'home/+/devices/+/meta',
  elevatorCall: 'home/+/elevator/call',
  elevatorStatus: 'home/+/elevator/status',
};

/** 토픽 해석: { homeId, deviceId?, channel } 또는 null */
function parse(topic) {
  const p = topic.split('/');
  if (p[0] !== 'home') return null;
  if (p.length === 5 && p[2] === 'devices') return { homeId: p[1], deviceId: p[3], channel: p[4] };
  if (p.length === 4 && p[2] === 'elevator') return { homeId: p[1], deviceId: null, channel: `elevator/${p[3]}` };
  return null;
}

/** 공유 구독: 같은 서비스 레플리카가 여러 개여도 메시지를 한 번만 처리 */
const shared = (group, filter) => `$share/${group}/${filter}`;

module.exports = { topics: t, ALL_TOPICS: ALL, parseTopic: parse, sharedTopic: shared };
