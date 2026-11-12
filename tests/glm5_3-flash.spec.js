// GLM5.3 Flashが生成したサンプルコードをベースにテストとして動作するように修正したもの
import { test, expect } from "@playwright/test";

// ---------------- 設定（ここを書き換えて使ってください） ----------------
const SEARCH_URL =
  "https://www2.jpx.co.jp/tseHpFront/JJK010010Action.do?Show=Show"; // 検索条件入力ページ
const COMPANY_NAME = "トヨタ"; // 検索する銘柄名（会社名）
const DISPLAY_COUNT = "50"; // 表示社数: '10' / '50' / '100' / '200'
const HEADLESS = true; // true: 画面なし / false: 画面表示

// 証券コードの書式チェック用（2024年1月以降は5桁。4桁や英字入りも許容）
const CODE_PATTERN = /^\d{4,5}[A-Z]?$/;

test("test", async ({ page }) => {
  // const browser = await chromium.launch({ headless: HEADLESS });
  // try {
  // const page = await browser.newPage();

  // (1) 検索条件入力ページを開く
  await page.goto(SEARCH_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });

  // (2) フォームに検索条件を入力
  await page.fill('input[name="mgrMiTxtBx"]', COMPANY_NAME); // 銘柄名（会社名）
  await page.selectOption('select[name="dspSsuPd"]', DISPLAY_COUNT); // 表示社数

  // (3) 検索ボタンを押す（サイト側JSがフォームをPOSTするため遷移完了を待つ）
  await Promise.all([
    page.waitForURL(
      (url) =>
        url.pathname.includes("JJK010010Action.do") &&
        !url.searchParams.has("Show"),
      { timeout: 60_000 },
    ),
    page.click('input[name="searchButton"]'),
  ]);

  // (4) 検索結果の表示を待つ（結果表 or 0件メッセージ）
  const resultsTable = page
    .locator("table.tableStyle01")
    .filter({ has: page.locator('th:text-is("コード")') });
  const zeroHitMessage = page.getByText(
    "指定条件に該当するデータはありませんでした",
  );

  await Promise.race([
    resultsTable.waitFor({ state: "visible", timeout: 60_000 }),
    zeroHitMessage.waitFor({ state: "visible", timeout: 60_000 }),
  ]);

  if (await zeroHitMessage.isVisible()) {
    console.log(`検索キーワード「${COMPANY_NAME}」の結果: 0件でした。`);
    return;
  }

  const summary = (
    (await page.locator(".pagingmenu strong").first().textContent()) ?? ""
  ).trim();

  // (5) 結果表から証券コードを抽出（行の並び: コード/銘柄名/市場区分/業種分類/...）
  const rows = resultsTable.locator("tr:has(td)");
  const records = [];
  for (const row of await rows.all()) {
    const cells = row.locator("td");
    const code = (await cells.nth(0).innerText()).trim();
    if (!CODE_PATTERN.test(code)) continue;

    records.push({
      証券コード: code,
      銘柄名: (await cells.nth(1).innerText()).trim(),
      市場区分: (await cells.nth(2).innerText()).trim(),
      業種分類: (await cells.nth(3).innerText()).trim(),
    });
  }

  console.log(`■ 検索キーワード: 「${COMPANY_NAME}」 (${summary})`);
  console.table(records);
  console.log(
    "■ 証券コード一覧:",
    records.map((r) => r.証券コード),
  );
});
