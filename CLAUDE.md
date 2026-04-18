# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Chrome拡張機能（Manifest V3）。現在のタブのタイトルとデコード済みURLをクリップボードにコピーする。ビルドツール・テストフレームワーク・依存パッケージは一切なし。

## Installation / Loading

1. `chrome://extensions/` を開く
2. デベロッパーモード ON
3. 「パッケージ化されていない拡張機能を読み込む」でこのフォルダを選択
4. コード変更後は拡張機能ページで「再読み込み」ボタンを押す

## Architecture

すべての処理は `background.js` のサービスワーカーで完結する。`chrome.scripting.executeScript` で `mainProcessInPage` 関数をページ内に注入し、ページのコンテキストで実行させる方式。

**実行フロー:**
```
アイコンクリック or 右クリックメニュー
  └─ executeCopy(tab, targetLang)
       └─ chrome.scripting.executeScript → mainProcessInPage(targetLang)
            ├─ 1. URL取得・クリーンアップ（下記ルール → decodeURIComponent）
            ├─ 2. タイトル取得（サイト別セレクタ → document.title フォールバック）
            └─ 3. コピー（Clipboard API → textarea+execCommand フォールバック）
```

**URLクリーンアップルール:**
| 条件 | 処理 |
|------|------|
| `support.google.com`（`/s/community/` 以外） | `?` 以降を全削除してからdecode |
| `support.google.com/s/community/` | パラメーター保持のままdecode |
| その他 | `uule` と `hl` のみ削除してからdecode |

**コンテキストメニュー3種:**
- `copy-google-en` — Google Supportタイトルを英語（hl=en）でfetch取得
- `copy-google-ja` — Google Supportタイトルを日本語（hl=ja）でfetch取得
- `copy-standard` — 通常コピー（アイコンクリックと同じ動作）

## Key Constraints

- `mainProcessInPage` はページのコンテキストで動くため、Chrome拡張のAPIは一切使えない（`chrome.*` 不可）
- `offscreen.html/js` はファイルとして存在するが未使用（manifest未登録・background.jsから未参照）
- `chrome://` および Chrome Web Store URLはスクリプト注入をガードして早期リターン

## Site-specific Title Selectors

新しいサイト対応を追加する場合は `mainProcessInPage` 内の `if (!title)` ブロックに追記する：

| サイト | セレクタ |
|--------|----------|
| Epson FAQ | `.faq_qstCont_ttl`, `#QuestionDescription`, `dt.question` |
| Yahoo!ニュース | `article > header > h1` |
| ESET サポート | `h2.faq_qstCont_ttl > span.icoQ` |
| Blogspot (kitaney) | `h3` |
| Google Support | `hl` パラメータ付きfetchで `h1` or `doc.title` |
