import { google, sheets_v4 } from "googleapis";
import { config } from "../config";

let cached: sheets_v4.Sheets | null = null;

/** 서비스 계정으로 인증된 Google Sheets 클라이언트를 반환한다 (싱글턴) */
export function getSheets(): sheets_v4.Sheets {
  if (cached) return cached;
  const scopes = ["https://www.googleapis.com/auth/spreadsheets"];
  // CI 등에서는 인라인 JSON 시크릿, 로컬에서는 키 파일 경로 사용
  const auth = config.google.keyJson
    ? new google.auth.GoogleAuth({ credentials: JSON.parse(config.google.keyJson), scopes })
    : new google.auth.GoogleAuth({ keyFile: config.google.keyFile, scopes });
  cached = google.sheets({ version: "v4", auth });
  return cached;
}

const sheetId = config.google.sheetId;

/** 지정 범위(A1 표기)의 값을 2차원 배열로 읽는다 */
export async function readRange(range: string): Promise<string[][]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  });
  return (res.data.values as string[][]) ?? [];
}

/** 한 행을 탭 맨 아래에 추가한다 */
export async function appendRow(tab: string, row: (string | number)[]): Promise<void> {
  const sheets = getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${tab}!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}

/** 특정 셀 범위에 값을 덮어쓴다 */
export async function writeRange(range: string, values: (string | number)[][]): Promise<void> {
  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

/** 워크북에 존재하는 탭 제목 목록 */
export async function listTabs(): Promise<string[]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  return (res.data.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean);
}

/** 없는 탭이면 생성하고, 헤더가 비어있으면 채운다 */
export async function ensureTab(tab: string, header: string[]): Promise<void> {
  const sheets = getSheets();
  const existing = await listTabs();
  if (!existing.includes(tab)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] },
    });
  }
  const firstRow = await readRange(`${tab}!A1:Z1`);
  if (firstRow.length === 0 || firstRow[0].length === 0) {
    await writeRange(`${tab}!A1`, [header]);
  }
}
