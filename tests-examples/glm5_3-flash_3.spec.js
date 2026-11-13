/**
* ※更新の待機をレコード数で判定するように変更したもの。
* 以前のバージョンでは、件数表示の切替を待つだけで、表の行がまだ更新されていない状態で抽出してしまう可能性がある。
* が、現状のサイトでは、件数表示の切替と表の行の更新がほぼ同時に行われるため、実測では問題が起きていないため採用見送り。
*
* 東証上場会社情報サービス スクレイピングサンプル（ページング対応版）
 * ---------------------------------------------------------------
 * 検索条件:
 *   - 表示件数: 200件
 *   - 市場区分: グロース にチェック
 *   - 会社名・コード: 入力しない
 *
 * フローの流れ:
 *   (1) 検索条件入力ページを開く
 *         https://www2.jpx.co.jp/tseHpFront/JJK010010Action.do?Show=Show
 *   (2) 「200件」表示 + 「グロース」にチェックして検索ボタンを押す
 *   (3) 検索結果ページ
 *         https://www2.jpx.co.jp/tseHpFront/JJK010010Action.do
 *       の結果表から証券コードを抽出し、「次へ」でページングして
 *       全ページ分の証券コードを取得する
 *
 * 必要環境:
 *   Node.js 20 以上 / playwright 1.65.0 / Chromium
 *
 * セットアップ:
 *   npm install playwright@1.65.0
 *   npx playwright install chromium
 *
 * 実行:
 *   node jpx-search-codes.mjs
 *
 * 注意:
 *   - JPX サイトへの連続アクセスは負荷になるため、頻繁な実行は避けてください。
 *   - 取得データの利用条件は「データ利用上の注意事項」
 *     (https://www.jpx.co.jp/listing/co-search/01.html) を確認してください。
 */

import { chromium } from 'playwright';

// ---------------------------------------------------------------
// 設定（ここを書き換えて使ってください）
// ---------------------------------------------------------------
const SEARCH_URL =
  'https://www2.jpx.co.jp/tseHpFront/JJK010010Action.do?Show=Show'; // 検索条件入力ページ
const DISPLAY_COUNT = '200'; // 表示件数: '10' / '50' / '100' / '200'
// 市場区分チェックボックスの value:
//   '011'=プライム, '012'=スタンダード, '013'=グロース, '008'=TOKYO PRO Market,
//   '111'~'113'=外国株, 'ETF', 'ETN', 'RET'=不動産投資信託, 'IFD'=インフラファンド, '999'=その他
const MARKET_VALUES = ['013']; // グロース（複数指定可: 例 ['011', '012', '013']）
const HEADLESS = true;         // true: 画面を表示せず実行 / false: 画面を表示して実行

// 証券コードの書式チェック用。
//   - 5桁数字            : 72030 （2024年1月以降の標準。旧4桁コード+チェックデジット）
//   - 3桁数字+英字+1桁    : 130A0 （旧130Aなど英字入りコードの5桁化後の形式）
//   - 4桁数字            : 7203  （旧形式・ETF等で見られる形式も許容）
//   - 3~4桁数字+英字     : 130A  （旧形式）
const CODE_PATTERN = /^(\d{4,5}|\d{3,4}[A-Z]\d?)$/;

// ---------------------------------------------------------------
// 現在ページの結果表から行データを一括抽出
//   表の列順: コード / 銘柄名 / 市場区分 / 業種分類 / 決算期 / ...
//   （1行ずつ取得すると遅いため evaluateAll でまとめて取得する）
// ---------------------------------------------------------------
async function extractCurrentPage(page, resultsTable) {
  const rows = resultsTable.locator('tr:has(td)');
  return rows.evaluateAll((trs) =>
    trs.map((tr) => {
      const cell = (i) => (tr.querySelectorAll('td')[i]?.innerText ?? '').trim();
      return {
        証券コード: cell(0),
        銘柄名: cell(1),
        市場区分: cell(2),
        業種分類: cell(3),
      };
    }),
  );
}

// ---------------------------------------------------------------
// メイン処理
// ---------------------------------------------------------------
async function main() {
  const browser = await chromium.launch({ headless: HEADLESS });
  try {
    const page = await browser.newPage();

    // (1) 検索条件入力ページを開く
    await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // (2) フォームに検索条件を入力
    //   - 表示件数: select[name="dspSsuPd"] で「200件」を選択
    //   - 市場区分: input[name="szkbuChkbx"][value="013"]（グロース）にチェック
    //   - 会社名（mgrMiTxtBx）・コード（eqMgrCd）は入力しない
    await page.selectOption('select[name="dspSsuPd"]', DISPLAY_COUNT);
    for (const value of MARKET_VALUES) {
      await page.check(`input[name="szkbuChkbx"][value="${value}"]`);
    }

    // (3) 検索ボタン（input[name="searchButton"]）を押す
    //   ボタンは type="button" で、クリック時にサイト側のJavaScriptが
    //   フォームをPOST送信するため、ページ遷移の完了を待ち合わせる。
    //   遷移後のURLは「.../JJK010010Action.do」（?Show=Show が付かない）。
    await Promise.all([
      page.waitForURL(
        (url) =>
          url.pathname.includes('JJK010010Action.do') &&
          !url.searchParams.has('Show'),
        { timeout: 60_000 },
      ),
      page.click('input[name="searchButton"]'),
    ]);

    // (4) 検索結果の表示を待つ
    //   結果表: ヘッダ「コード」を含む table.tableStyle01
    //   0件時 : 「指定条件に該当するデータはありませんでした。」が表示される
    const resultsTable = page
      .locator('table.tableStyle01')
      .filter({ has: page.locator('th:text-is("コード")') });
    const zeroHitMessage = page.getByText(
      '指定条件に該当するデータはありませんでした',
    );

    await Promise.race([
      resultsTable.waitFor({ state: 'visible', timeout: 60_000 }),
      zeroHitMessage.waitFor({ state: 'visible', timeout: 60_000 }),
    ]);

    if (await zeroHitMessage.isVisible()) {
      console.log('検索結果: 0件でした。');
      return;
    }

    // (5) 全ページ分をループして証券コードを収集
    //   件数表示（例: 「1～200件を表示／594件中」）はページ上部と下部の2箇所あるため .first() を使用
    const summaryLocator = page.locator('.pagingmenu strong').first();
    // 「次へ」リンク（最終ページでは <div class="next"> が空になりリンクが消える）
    const nextLink = page.locator('.pagingmenu .next a').first();
    const records = [];
    let pageNo = 1;
    let totalCount = 0; // サイトに表示された総件数（最終検証用）

    while (true) {
      // 現在ページの表示範囲と総件数を解析（例: 「1～200件を表示／594件中」）
      const summary = (await summaryLocator.innerText()).trim();
      const matched = summary.match(/(\d+)～(\d+)件を表示／(\d+)件中/);
      if (!matched) {
        throw new Error(`件数表示を解析できませんでした: ${summary}`);
      }
      const start = Number(matched[1]);
      const end = Number(matched[2]);
      const total = Number(matched[3]);
      totalCount = total;

      // このページの期待行数（例: 1～200ページなら200、最終ページなら194）
      const expectedRows = end - start + 1;

      // 件数表示はHTML上、結果表より「先」に出現するため、表示が切り替わった
      // 直後でもまだ表の行が解析中の可能性がある（実測で約40msの時間差あり）。
      // evaluateAll は待ち合わせなしで「その瞬間」のDOMを評価するため、
      // 抽出前に「行数が期待どおり ＆ 最終行の先頭セル（コード）に中身がある」
      // ことを確認してから評価する。
      // ※ この待機は必ず「件数表示の切替後」に置くこと。切替前に置くと
      //   遷移前の旧ページも同じ行数を満たしてしまい、待機として機能しない。
      await page.waitForFunction(
        (n) => {
          const rows = document.querySelectorAll(
            'table.tableStyle01 tr:has(td)',
          );
          return (
            rows.length === n &&
            (rows[n - 1].querySelector('td')?.textContent ?? '').trim() !== ''
          );
        },
        expectedRows,
        { timeout: 30_000 },
      );

      // 現在ページの結果表から証券コード等を一括抽出
      const pageRecords = (await extractCurrentPage(page, resultsTable)).filter(
        (r) => CODE_PATTERN.test(r.証券コード),
      );
      if (pageRecords.length === 0) break; // 万一の無限ループ防止
      records.push(...pageRecords);
      console.log(`[ページ${pageNo}] ${summary} → ${pageRecords.length}件抽出`);

      // 総件数に達したら終了
      if (records.length >= total) break;

      // 「次へ」リンクがなければ終了（最終ページ）
      if (!(await nextLink.isVisible())) break;

      // 「次へ」を押して次ページへ遷移
      //   遷移完了の1次判定は、遷移後の件数表示（例: 「201～400件を表示」）の出現。
      //   表の行が出揃ったことの確認は、ループ先頭の waitForFunction で行う。
      const nextStart = end + 1;
      const nextEnd = Math.min(nextStart + expectedRows - 1, total);
      await Promise.all([
        summaryLocator
          .filter({ hasText: `${nextStart}～${nextEnd}件を表示` })
          .waitFor({ state: 'visible', timeout: 60_000 }),
        nextLink.click(),
      ]);
      pageNo += 1;
    }

    // 最終検証: 取得件数がサイト表示の総件数と一致すること。
    // ページング途中で行の取りこぼしが起きた場合、この時点で明示的に失敗させる
    // （黙って少ない件数の結果を返すことを防ぐ）。
    if (records.length !== totalCount) {
      throw new Error(
        `取得件数(${records.length}件)がサイトの総件数(${totalCount}件)と一致しません。` +
          'どこかのページで行の取りこぼしが発生した可能性があります。',
      );
    }

    // (6) 結果をコンソールに表示
    const codes = records.map((r) => r.証券コード);
    console.log(
      `\n■ 総取得件数: ${records.length}件 ／ ユニークな証券コード: ${new Set(codes).size}件`,
    );
    console.table(records);
    // console.log で配列を直接渡すと表示が100件で省略されるため join で全件を出力する
    console.log('■ 証券コード一覧:', codes.join(', '));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('エラーが発生しました:', err);
  process.exitCode = 1;
});
