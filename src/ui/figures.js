// [D 담당] 프롤로그와 메뉴 화면의 인물. 전투 화면과 같은 캐릭터 그림을 fx에서 빌려 크게 그린다.
// o = { who: 'hero'|'senior'|'brawler', pose, scale(정수), facing, t, dark(실루엣 색), fall(0..1), move }
//   hero / senior 자세: 'stand' | 'kick' | 'hunch' | 'down'
//   brawler 자세: 'stand'(주먹을 든 자세) | 'loom' | 'walk' | 'down'
export { drawPortrait as figure } from '../fx/portrait.js';
