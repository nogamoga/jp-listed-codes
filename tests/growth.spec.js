import { test, expect } from "@playwright/test";
import fs from "fs";

// 証券コードだけを取得
const getCodes = async (tableLocator, i) => {
  return await tableLocator
    .locator("tr")
    .nth(i)
    .locator("td:nth-child(1)")
    .allInnerTexts();
};

test("test", async ({ page }) => {
  test.setTimeout(1000 * 60 * 5);
  await page.goto(
    "https://www2.jpx.co.jp/tseHpFront/JJK010010Action.do?Show=Show"
  );
  // プライムを開く
  await page.getByRole("combobox").selectOption("200");
  await page.getByLabel("グロース", { exact: true }).check();
  // await page.getByRole("button", { name: "検索" }).click();
  await page.locator(".activeButton").click();

  // 右上のページャーから全体ページ数を取得
  const page_size = await page
    .locator(".linkbox")
    .nth(0)
    .locator("a, b")
    .count();
  // console.log(page_size);

  let codes = [];

  // 先頭ページのテーブルを処理
  const tableLocator = await page.locator(".tableStyle01 tbody");
  const row_size = await tableLocator.locator("tr").count();
  // console.log(`row_size = ${row_size}`);
  for (let j = 0; j < row_size; j++) {
    const second_row_text = await getCodes(tableLocator, j);
    // console.log(second_row_text);
    await second_row_text.forEach((text) => {
      // console.log(text);
      codes.push(text);
    });
  }

  // 2ページ目以降のテーブルを処理
  for (let i = 2; i <= page_size; i++) {
    await page
      .getByRole("link", { name: String(i) })
      .first()
      .click();
    await page.waitForLoadState(); // テーブルの更新を待つ

    const tableLocator = await page.locator(".tableStyle01 tbody");
    const row_size = await tableLocator.locator("tr").count();
    // console.log(`row_size = ${row_size}`);
    for (let j = 0; j < row_size; j++) {
      const second_row_text = await getCodes(tableLocator, j);
      // console.log(second_row_text);
      await second_row_text.forEach((text) => {
        // console.log(text);
        codes.push(text);
      });
    }
  }

  // ファイルへ保存
  codes = codes.map((v) => v.slice(0, -1));
  // console.log(codes);
  try {
    fs.writeFileSync("docs/api/growth.json", JSON.stringify(codes));
  } catch (err) {
    console.log(err);
  }
});
