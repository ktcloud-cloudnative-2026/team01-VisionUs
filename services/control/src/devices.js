// 기기 종류 찾기 (임시)
// TODO: Device 서비스 API가 생기면 여기만 바꾼다. 다른 파일은 그대로.
const TEMP_DEVICES = {
  'light-living-01': 'light',
  'aircon-living-01': 'aircon',
  'heater-room-01': 'heater',
  'purifier-living-01': 'purifier',
  'curtain-living-01': 'curtain',
};

// 있으면 기기 종류('light' 등), 없으면 null
export async function getDeviceType(deviceId) {
  return TEMP_DEVICES[deviceId] || null;
}