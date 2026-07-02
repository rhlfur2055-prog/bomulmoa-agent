/**
 * Bomulmoa 리서치 엔진 (Apps Script — 시트 안에서 직접 실행)
 * · 고물상 시세 스크래핑(gomulprice.com) → '시세조사' 탭
 * · 고물상 관련 뉴스(Google News RSS) → '뉴스' 탭 (중복 제거)
 * 외부 서버/서비스계정 불필요. 메뉴 클릭 또는 트리거로 자동 실행.
 */

const TAB_MARKET = '시세조사';
const TAB_NEWS = '뉴스';

const NEWS_QUERY = '고물상 OR 고철시세 OR 비철금속 OR 재활용 OR 자원순환';

/** 시세 + 뉴스 한 번에 수집해서 시트에 기록 */
function refreshResearch() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const nMarket = saveMarket_(ss, scrapeMarket_());
  const nNews = saveNews_(ss, fetchNews_());
  SpreadsheetApp.getActiveSpreadsheet().toast(
    '시세 ' + nMarket + '건 · 새 뉴스 ' + nNews + '건 기록 완료', '🔎 리서치', 5
  );
}

// ── 시세 스크래핑 ─────────────────────────────────────────
function scrapeMarket_() {
  const url = 'https://gomulprice.com/';
  const html = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (BomulmoaBot)' },
  }).getContentText();

  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const out = [];
  rows.forEach(function (row) {
    const cells = (row.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map(function (c) {
      return c.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    });
    if (cells.length < 2) return;

    // 가격 셀: 콤마/원 포함, 값 10~999,999 (8자리 기준일 자동 제외)
    let pi = -1;
    for (let i = 0; i < cells.length; i++) {
      if (!/[,원]/.test(cells[i])) continue;
      const n = Number(cells[i].replace(/[^0-9]/g, ''));
      if (n >= 10 && n <= 999999) { pi = i; break; }
    }
    if (pi <= 0) return;
    const price = Number(cells[pi].replace(/[^0-9]/g, ''));
    const item = cells[pi - 1];
    if (!item || !/[가-힣]/.test(item) || item.length > 20) return;

    const first = cells[0];
    const cat = /비철/.test(first) ? '비철'
      : /철/.test(first) ? '고철'
      : /생철|중량|경량/.test(item) ? '고철' : '비철';
    out.push([cat, item, price]);
  });
  return out;
}

function saveMarket_(ss, rows) {
  let sh = ss.getSheetByName(TAB_MARKET);
  if (!sh) {
    sh = ss.insertSheet(TAB_MARKET);
    sh.appendRow(['수집일시', '구분', '품목', '시세(원/kg)', '출처']);
    sh.getRange('A1:E1').setFontWeight('bold').setBackground('#F4F1EA');
    sh.setFrozenRows(1);
  }
  const now = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');
  rows.forEach(function (r) { sh.appendRow([now, r[0], r[1], r[2], 'gomulprice.com']); });
  return rows.length;
}

// ── 뉴스 수집 (Google News RSS) ───────────────────────────
function fetchNews_() {
  const url = 'https://news.google.com/rss/search?q=' +
    encodeURIComponent(NEWS_QUERY) + '&hl=ko&gl=KR&ceid=KR:ko';
  const xml = UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText();
  const doc = XmlService.parse(xml);
  const channel = doc.getRootElement().getChild('channel');
  const items = channel.getChildren('item').slice(0, 15);
  return items.map(function (it) {
    const title = it.getChildText('title') || '';
    const link = it.getChildText('link') || '';
    const m = title.match(/ - ([^-]+)$/);
    return { title: title, link: link, source: m ? m[1].trim() : '' };
  });
}

function saveNews_(ss, items) {
  let sh = ss.getSheetByName(TAB_NEWS);
  if (!sh) {
    sh = ss.insertSheet(TAB_NEWS);
    sh.appendRow(['수집일', '제목', '출처', '링크']);
    sh.getRange('A1:D1').setFontWeight('bold').setBackground('#F4F1EA');
    sh.setFrozenRows(1);
  }
  // 기존 링크 집합 (중복 방지)
  const last = sh.getLastRow();
  const seen = {};
  if (last > 1) {
    sh.getRange(2, 4, last - 1, 1).getValues().forEach(function (r) { if (r[0]) seen[r[0]] = 1; });
  }
  const today = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  let added = 0;
  items.forEach(function (it) {
    if (!it.link || seen[it.link]) return;
    sh.appendRow([today, it.title, it.source, it.link]);
    seen[it.link] = 1;
    added++;
  });
  return added;
}

// ── 자동 실행 트리거 설치 (6시간마다) ─────────────────────
function installResearchTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'refreshResearch') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('refreshResearch').timeBased().everyHours(6).create();
  SpreadsheetApp.getUi().alert('✅ 6시간마다 자동 리서치 실행 트리거를 설치했어요.');
}
