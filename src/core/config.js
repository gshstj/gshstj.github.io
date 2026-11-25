// 공용 상수. 리드만 수정한다.
// 각 담당의 밸런스 수치는 자기 폴더의 tuning.js에 둔다.
export const W = 480;          // 논리 해상도 (가로)
export const H = 270;          // 논리 해상도 (세로)
export const GROUND_Y = 222;   // 바닥 y. 엔티티의 y는 "발 위치"다.
export const GRAVITY = 1400;   // px/s^2
export const DT = 1 / 60;      // 고정 타임스텝
export const RENDER_SCALE = 4; // 논리 1px을 몇 픽셀로 그리는가 (4 = 1920x1080)
