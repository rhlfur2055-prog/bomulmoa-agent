/**
 * Bomulmoa 팀 작업관리 사이드바 (Google Apps Script)
 * 구글 시트 안에서 실행 — 팀원별 일일 작업/시간/진행률 기록 + txt 문서화 + 1개월 로드맵
 *
 * 설치: 확장 프로그램 → Apps Script → 이 코드와 Sidebar.html 붙여넣기 → setup 실행 → 시트 새로고침
 */

// ── 탭 이름 ──
const TAB_LOG = '일일작업로그';
const TAB_PLAN = '프로젝트계획';
const TAB_QUOTA = '할당량';

// ── 팀 기본값 ── (할당량 탭에서 수정 가능). 하루 목표 1시간
// UI/UX 담당은 추후 모집 예정
const DEFAULT_TEAM = [
  ['오도경', '프론트', 1],
  ['임동근', 'AI', 1],
  ['임혁진', '백엔드', 1],
];

/** 시트 열 때 메뉴 자동 추가 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🪙 Bomulmoa')
    .addItem('작업 사이드바 열기', 'showSidebar')
    .addSeparator()
    .addItem('초기 설정(탭/로드맵 생성)', 'setup')
    .addToUi();
}

/** 사이드바 표시 */
function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('🪙 Bomulmoa 작업관리')
    .setWidth(340);
  SpreadsheetApp.getUi().showSidebar(html);
}

/** 필요한 탭 3개 생성 + 로드맵/할당량 채우기 */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1) 일일작업로그
  let log = ss.getSheetByName(TAB_LOG);
  if (!log) {
    log = ss.insertSheet(TAB_LOG);
    log.appendRow(['기록시각', '날짜', '팀원', '트랙', '작업내용', '어디까지 했는지', '시간(h)', '진행률(%)']);
    log.getRange('A1:H1').setFontWeight('bold').setBackground('#F4F1EA');
    log.setFrozenRows(1);
  }

  // 2) 할당량
  let quota = ss.getSheetByName(TAB_QUOTA);
  if (!quota) {
    quota = ss.insertSheet(TAB_QUOTA);
    quota.appendRow(['팀원', '트랙', '하루 할당(h)']);
    quota.getRange('A1:C1').setFontWeight('bold').setBackground('#F4F1EA');
    DEFAULT_TEAM.forEach(function (r) { quota.appendRow(r); });
  }

  // 3) 프로젝트계획 (1개월 로드맵)
  let plan = ss.getSheetByName(TAB_PLAN);
  if (!plan) {
    plan = ss.insertSheet(TAB_PLAN);
    plan.appendRow(['주차', '트랙', '목표', '세부 작업', '완료여부']);
    plan.getRange('A1:E1').setFontWeight('bold').setBackground('#F4F1EA');
    plan.setFrozenRows(1);
    ROADMAP.forEach(function (r) { plan.appendRow(r); });
    plan.autoResizeColumns(1, 5);
  }

  SpreadsheetApp.getUi().alert('✅ 설정 완료! 탭 3개(일일작업로그 / 할당량 / 프로젝트계획)가 준비됐어요.\n메뉴 → Bomulmoa → 작업 사이드바 열기');
}

/** 1개월 로드맵 (실제 팀 프로젝트처럼) */
const ROADMAP = [
  // Week 1 — 설계 & 셋업
  ['1주차', '백엔드', 'DB·API 뼈대', 'DB 스키마(품목/매입/회원/키오스크), FastAPI 프로젝트 셋업, 인증 골격', ''],
  ['1주차', '프론트', '키오스크 UI 설계', '화면 흐름 와이어프레임, 라우팅, 디자인 시스템(컬러/폰트) 정의', ''],
  ['1주차', 'AI', '기술 조사', '품목 이미지 분류 모델 조사, 실시간 시세 데이터 소스 조사, 데이터 수집 파이프라인 설계', ''],
  // Week 2 — 핵심 기능
  ['2주차', '백엔드', '핵심 API', '매입 API, 단가 API, 정산 로직, 무게→금액 계산', ''],
  ['2주차', '프론트', '메인 플로우', '품목선택 → 무게입력 → 정산 확인 화면 구현', ''],
  ['2주차', 'AI', '분류 프로토타입', '품목 이미지 분류 프로토타입, 무게 표시 OCR 조사, 정확도 측정', ''],
  // Week 3 — 통합
  ['3주차', '백엔드', '연동·정산', '프론트 API 연동, 현금 방출 인터페이스, 거래 로그', ''],
  ['3주차', '프론트', '실기기 테스트', '키오스크 실기기 반응형 테스트, 예외/오류 UX', ''],
  ['3주차', 'AI', '모델 연동', '분류 모델 API 연동, 실시간 시세 자동반영 연동', ''],
  // Week 4 — 안정화 & 데모
  ['4주차', '공통', '통합·데모', '통합 테스트, 버그픽스, 파일럿 매장 데모 시나리오 준비', ''],
];

// ─────────────────────────────────────────────
//  사이드바에서 호출하는 함수들 (google.script.run)
// ─────────────────────────────────────────────

/** 할당량 탭 → 팀원 목록 반환 */
function getTeam() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const q = ss.getSheetByName(TAB_QUOTA);
  if (!q) return DEFAULT_TEAM.map(function (r) { return { name: r[0], track: r[1], quota: r[2] }; });
  const rows = q.getRange(2, 1, Math.max(q.getLastRow() - 1, 0), 3).getValues();
  return rows.filter(function (r) { return r[0]; }).map(function (r) {
    return { name: r[0], track: r[1], quota: Number(r[2]) || 0 };
  });
}

/** 작업 1건 기록 */
function logWork(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = ss.getSheetByName(TAB_LOG);
  if (!log) throw new Error('먼저 초기 설정을 실행하세요.');
  const now = new Date();
  const dateStr = Utilities.formatDate(now, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  const timeStr = Utilities.formatDate(now, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');
  log.appendRow([
    timeStr,
    dateStr,
    data.member,
    data.track,
    data.task,
    data.progressNote,
    Number(data.hours) || 0,
    Number(data.percent) || 0,
  ]);
  return getTodayDashboard();
}

/** 오늘 팀원별 현황 (누적시간, 할당량, 달성률, 최근 진행상태) */
function getTodayDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = ss.getSheetByName(TAB_LOG);
  const today = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  const team = getTeam();

  const acc = {}; // name → {hours, lastNote, lastPercent, tasks}
  if (log && log.getLastRow() > 1) {
    const rows = log.getRange(2, 1, log.getLastRow() - 1, 8).getValues();
    rows.forEach(function (r) {
      if (r[1] !== today) return;
      const name = r[2];
      if (!acc[name]) acc[name] = { hours: 0, lastNote: '', lastPercent: 0, tasks: 0 };
      acc[name].hours += Number(r[6]) || 0;
      acc[name].tasks += 1;
      if (r[5]) acc[name].lastNote = r[5];
      if (r[7] !== '' && r[7] != null) acc[name].lastPercent = Number(r[7]) || 0;
    });
  }

  return {
    date: today,
    members: team.map(function (m) {
      const a = acc[m.name] || { hours: 0, lastNote: '', lastPercent: 0, tasks: 0 };
      return {
        name: m.name,
        track: m.track,
        quota: m.quota,
        hours: Math.round(a.hours * 10) / 10,
        rate: m.quota ? Math.round((a.hours / m.quota) * 100) : 0,
        percent: a.lastPercent,
        lastNote: a.lastNote,
        tasks: a.tasks,
      };
    }),
  };
}

/**
 * 오늘(또는 전체) 진행상황을 .txt 파일로 Drive에 저장하고 링크 반환
 * @param {boolean} allDays true면 전체 로그, false면 오늘만
 */
function exportProgressTxt(allDays) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = ss.getSheetByName(TAB_LOG);
  const tz = ss.getSpreadsheetTimeZone();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  let out = '===== Bomulmoa 작업 진행상황 =====\n';
  out += '생성: ' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm') + '\n';
  out += (allDays ? '범위: 전체\n' : '범위: 오늘(' + today + ')\n');
  out += '=================================\n\n';

  // 오늘 요약
  const dash = getTodayDashboard();
  out += '[오늘 팀 현황]\n';
  dash.members.forEach(function (m) {
    out += '· ' + m.name + '(' + m.track + ') — ' + m.hours + 'h / 할당 ' + m.quota + 'h (' + m.rate + '%)'
      + ' · 진행률 ' + m.percent + '%\n';
    if (m.lastNote) out += '    ↳ 어디까지: ' + m.lastNote + '\n';
  });
  out += '\n';

  // 상세 로그
  out += '[상세 로그]\n';
  if (log && log.getLastRow() > 1) {
    const rows = log.getRange(2, 1, log.getLastRow() - 1, 8).getValues();
    rows.forEach(function (r) {
      if (!allDays && r[1] !== today) return;
      out += '- ' + r[0] + ' | ' + r[2] + '(' + r[3] + ') | ' + r[4]
        + ' | ' + (Number(r[6]) || 0) + 'h | 진행률 ' + (r[7] || 0) + '%\n';
      if (r[5]) out += '    어디까지: ' + r[5] + '\n';
    });
  } else {
    out += '(기록 없음)\n';
  }

  const fname = 'Bomulmoa_진행상황_' + (allDays ? '전체_' : today + '_') +
    Utilities.formatDate(new Date(), tz, 'HHmm') + '.txt';
  const file = DriveApp.createFile(fname, out, MimeType.PLAIN_TEXT);
  return { name: fname, url: file.getUrl() };
}
