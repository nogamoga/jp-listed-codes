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
  await page.waitForLoadState("load");

  // グロースを開く
  await page.getByRole("combobox").selectOption("200");
  await page.getByLabel("グロース", { exact: true }).check();
  // await page.getByRole("button", { name: "検索" }).click();
  await page.locator(".activeButton").click();
  await page.waitForLoadState("domcontentloaded"); // 画面更新を待機

  // 左上の検索結果から全体ページ数を取得
  let text = await page
    .getByText(/.*表示.*件中/)
    .first()
    .textContent();
  let dateRegexp = /1～(?<part>\d*)件を表示／(?<all>\d*)件中/;
  let ret = text.match(dateRegexp);
  // console.log(ret.groups.part);
  // console.log(ret.groups.all);
  let page_size = Math.floor(Number(ret.groups.all) / Number(ret.groups.part));
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
  for (let i = 0; i < page_size; i++) {
    await page.getByRole("link", { name: "次へ" }).first().click();
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

  // 保存済ファイルと比較して変更がある場合は保存
  codes = codes.map((v) => v.slice(0, -1));
  const save_path = "docs/api/growth.json";
  let saved_json = fs.readFileSync(save_path);
  try {
    // Update on mismatch
    let saved_obj = JSON.parse(saved_json.toString());
    if (saved_obj.length != codes.length) {
      fs.writeFileSync(save_path, JSON.stringify(codes));
    } else {
      if (removeValues(codes, saved_obj).length > 0) {
        fs.writeFileSync(save_path, JSON.stringify(codes));
      }
    }
  } catch (e) {
    fs.writeFileSync(save_path, JSON.stringify(codes));
  }
});
