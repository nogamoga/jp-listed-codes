import { test, expect } from "@playwright/test";
import fs from "fs";

// 現在ページのテーブルから証券コードを一括取得
// ※ locator.all() + innerText の1行ずつ取得は、遷移と重なると
//   「行リストのずれ」(stale index) が発生するため evaluateAll を使う。
//   evaluateAll は呼び出し時点の行をアトミックに取得する。
const getCodes = (tableLocator) =>
  tableLocator.evaluateAll((trs) =>
    trs.map((tr) => (tr.querySelector("td")?.innerText ?? "").trim()),
  );

test("test", async ({ page }) => {
  test.setTimeout(1000 * 60 * 5);
  await page.goto(
    "https://www2.jpx.co.jp/tseHpFront/JJK010010Action.do?Show=Show",
  );

  // スタンダードを開く
  await page.getByRole("combobox").selectOption("200");
  await page.getByLabel("スタンダード", { exact: true }).check();
  // 検索ボタン: .activeButton は複数要素にマッチし得るため name 属性で特定する
  await page.locator("input[name='searchButton']").click();

  // 検索結果テーブル（ヘッダ「コード」を含む tableStyle01）のデータ行を待つ
  // ※ tableStyle01 の最初の tr は空のヘッダ行なので tr:has(td) を待つ
  const tableLocator = page
    .locator("table.tableStyle01")
    .filter({ has: page.locator('th:text-is("コード")') })
    .locator("tr:has(td)");
  await expect(tableLocator.first()).toBeVisible();

  // 1ページ目の件数表示から表示件数と総件数を取得（例: 「1～200件を表示／594件中」）
  // ※ 件数表示はページ上部・下部の2箇所あるため .first() を使用
  const summary = page.locator(".pagingmenu strong").first();
  const m = (await summary.innerText()).match(/1～(\d+)件を表示／(\d+)件中/);
  const pageSize = Number(m[1]);
  const total = Number(m[2]);
  const totalPages = Math.ceil(total / pageSize);

  // 1ページ目を取得
  let codes = await getCodes(tableLocator);
  expect(codes.length).toBe(Math.min(pageSize, total));

  // 2ページ目以降: 「次へ」を押し、遷移後の件数表示（例: 「201～400件を表示」）の
  // 出現で遷移の完了を確実に待ってから取得する
  // ※ waitForLoadState() は既に load 状態の旧ページに対して即座に解決するため、
  //   ページ遷移の待機には使えない
  for (let p = 2; p <= totalPages; p++) {
    const start = (p - 1) * pageSize + 1;
    const end = Math.min(p * pageSize, total);
    await Promise.all([
      // ページ自体は先頭ページと同じなので、先頭ページで取得した summary がそのまま使える
      summary.filter({ hasText: `${start}～${end}件を表示` }).waitFor(),
      page.locator(".pagingmenu .next a").first().click(),
    ]);
    const pageCodes = await getCodes(tableLocator);
    expect(pageCodes.length).toBe(end - start + 1); // 各ページの行数を検証
    codes = codes.concat(pageCodes);
  }

  // 全件数・重複の検証（抽出漏れ・重複があればテストを失敗させる）
  expect(codes.length).toBe(total);
  expect(new Set(codes).size).toBe(total);

  // 保存済ファイルと比較して変更がある場合は保存
  codes = codes.map((v) => v.slice(0, -1)); // 5桁 → 旧4桁形式（130A0 → 130A）
  // console.log(`スタンダード市場コード: ${codes}`);
  const save_path = "docs/api/standard.json";
  try {
    // ※ readFileSync も try の中で行う（ファイル未存在時のクラッシュを防ぐ）
    const saved_obj = JSON.parse(fs.readFileSync(save_path, "utf8"));
    const added = codes.filter((c) => !saved_obj.includes(c));
    const removed = saved_obj.filter((c) => !codes.includes(c));
    if (added.length > 0 || removed.length > 0) {
      fs.writeFileSync(save_path, JSON.stringify(codes));
    }
  } catch (e) {
    // ファイルが存在しない・不正なJSONの場合は新規保存
    fs.writeFileSync(save_path, JSON.stringify(codes));
  }
});
