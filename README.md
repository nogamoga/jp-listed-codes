# jp-listed-codes
- 東証(JPX)の上場銘柄の証券コードを市場ごとにJSONで返します

## API仕様
- **GET**：https://nogamoga.github.io/jp-listed-codes/api/prime.json
- **GET**：https://nogamoga.github.io/jp-listed-codes/api/standard.json
- **GET**：https://nogamoga.github.io/jp-listed-codes/api/growth.json

## レスポンス
```json
["1301","1332","1333",～省略～,"9990","9991","9997"]
```

## 元データ
[東京証券取引所　東証上場会社情報サービス](https://www2.jpx.co.jp/tseHpFront/JJK010010Action.do?Show=Show)
