// 스크래핑 결과를 구글시트 업로드용 CSV 로 stdout 에 출력한다 (시트 쓰기 권한 불필요)
import { collectPrices } from "./prices";
import { fetchNews } from "./news";

function esc(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function row(cells: (string | number)[]): string {
  return cells.map(esc).join(",");
}

(async () => {
  const today = new Date().toISOString().slice(0, 10);
  const [prices, news] = await Promise.all([collectPrices(), fetchNews(15)]);

  const lines: string[] = [];
  lines.push(row([`Bomulmoa 고물상 리서치 (${today})`]));
  lines.push("");
  lines.push(row(["■ 시세조사", "", "", ""]));
  lines.push(row(["구분", "품목", "시세(원/kg)", "출처"]));
  for (const p of prices) lines.push(row([p.category, p.item, p.price, p.source]));
  lines.push("");
  lines.push(row(["■ 고물상 뉴스", "", ""]));
  lines.push(row(["제목", "출처", "링크"]));
  for (const n of news) lines.push(row([n.title, n.source, n.link]));

  process.stdout.write(lines.join("\n"));
})();
