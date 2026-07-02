import { collectPrices } from "./src/research/prices";
import { fetchNews } from "./src/research/news";
(async () => {
  const p = await collectPrices();
  console.log("=== 시세", p.length, "건 ===");
  console.log(p.slice(0, 8).map((x) => `${x.category} ${x.item}: ${x.price}원`).join("\n"));
  const n = await fetchNews(5);
  console.log("=== 뉴스", n.length, "건 ===");
  console.log(n.map((x) => `- ${x.title}`).join("\n"));
})();
