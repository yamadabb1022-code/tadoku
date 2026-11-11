# 多読ノート

易しい英文をたくさん、楽しく読むための個人用多読サイトです（Day & Bamford の多読原則にもとづいています）。
バックエンドもビルドも不要で、依存ライブラリはありません。

## 起動方法

`file://` で直接開くと、教材の読み込みとオフライン機能が動きません。ローカルサーバー経由で開いてください。

```sh
cd C:\Users\yamad\tadoku
python -m http.server 8765
```

起動したら、ブラウザで http://localhost:8765/ を開きます。

- **スマホで使う場合**：GitHub Pages など HTTPS の静的ホスティングにフォルダごと置いてください。ブラウザの「ホーム画面に追加」でアプリのように使え、オフラインでも読めます。
- **データの保存場所**：記録は localStorage（`tadoku:v1`）、取り込んだ教材は IndexedDB に入っています。端末ごと・ブラウザごとに別々に保存されるので、設定画面の「バックアップを保存」で JSON に書き出しておくと安心です。

## 教材の追加

### 方法1：books フォルダに置く

1. `books/` に JSON ファイルを置きます（形式は下記）。
2. `books/index.json` の `books` 配列にファイル名を追加します。

### 方法2：画面から追加する

設定画面の「教材の追加」で、テキストを貼り付けるか JSON ファイルを読み込みます。追加した本はブラウザ内（IndexedDB）に保存されます。
Project Gutenberg の作品なら、プレーンテキストを開いて本文部分を貼り付けるだけで追加できます。

市販の graded readers の本文は入れないでください。「記録 › 外部本トラッカー」で、語数とレベルだけを記録できます。

### 教材JSONの形式

```json
{
  "id": "unique-id",
  "title": "Title",
  "author": "Author",
  "level": 2,
  "genres": ["fable", "classic"],
  "summary": "日本語の紹介文",
  "source": { "type": "public-domain | adapted-pd | original", "note": "...", "url": "..." },
  "chapters": [ { "title": "Chapter 1", "paragraphs": ["...", "..."] } ]
}
```

- `level` は 0〜6 の整数です。設定画面の対応表で、ERF・CEFR のどの帯にあたるかを確認できます。
- 語数は読み込み時に自動で数えます。
- `genres` に使えるキーは `fable` `fairy-tale` `classic` `daily` `mystery` `travel` `sf` `drama` `nonfiction` `science` `romance` `humor` `adventure` `history` `biography` です。これ以外の文字列を入れると、そのまま表示されます。

## 初期教材（13本・約5,000語）

- 自作の英文：8本（Lv0〜3）
- パブリックドメイン作品を易しく書き直したもの：5本
  - イソップ寓話 3話
  - グリム童話「小人と靴屋」
  - O・ヘンリー「賢者の贈り物」（Lv4）

## 記録の仕組み

- **読んだ語数**：画面の上端より前にある単語の数で数えます。途中でやめた場合も、読んだところまでが累計に入ります。
- **読書時間**：タブが表示されていて、直近2分以内に操作があった時間（または朗読中の時間）だけを数えます。
- **レベルの提案**：直近3件の「易しさ」評価のうち2件以上が同じ傾向なら、1段階上げる（または下げる）ことを提案します。

## ファイル構成

```
index.html / manifest.webmanifest / sw.js
css/style.css
js/app.js（ルーター） store.js（記録） db.js（IndexedDB） books.js（教材）
   levels.js stats.js charts.js tts.js ui.js reader.js
   views/home.js library.js stats.js words.js settings.js
books/index.json, *.json
icons/
```

JS や CSS を変更したときは、`sw.js` の `VERSION` を上げてください。古いキャッシュが残らなくなります。
