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

サービスワーカーがページ内の文字列生成、Offscreen Documentでのコピー、結果表示を制御する。Chrome 116以降の `runtime.getContexts` を利用する。

**実行フロー:**
```
アイコンクリック or 右クリックメニュー
  └─ executeCopy(tab, targetLang)
       ├─ 既定表示へ復元・制限URL判定・要求ID更新
       ├─ chrome.scripting.executeScript → mainProcessInPage(targetLang)
       │    ├─ URL取得・クリーンアップ・decodeURIComponent
       │    └─ サイト別タイトル取得 → { text } を返す
       ├─ ensureOffscreenDocument → 既存再利用 or 作成完了待ち
       └─ offscreen.js → 最新要求確認 → textarea + execCommand → 成否応答
            └─ 成功応答後のみOK、失敗は!とツールチップ（4秒後に復元）
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
- `offscreen` / `clipboardWrite` 権限を維持し、書き込みは `offscreen.html/js` のみで行う。textareaは必ず削除する。
- Offscreen作成Promiseを共有し、失敗時にリセット。既存確認はSW再起動後も `runtime.getContexts` で行う。
- 要求IDはSWごとの連番ではなくUUIDとし、古い要求の書き込み・表示を破棄。Offscreen側も書き込み直前にSWへ最新要求か確認する。
- クリップボードが全体共有のためバッジも全体表示。表示APIは直列化し、SW停止でタイマーを失っても次回開始時に既定表示へ戻す。
- 内部ページ、新旧Chrome Web Store、不明URLは注入せず失敗表示。注入失敗（file権限なし等）も捕捉する。
- Google Supportの言語指定取得はAbortControllerで5秒のタイムアウト、HTTP成否確認、h1のtextContent取得を行い、失敗時は既存タイトル抽出へ戻る。
- テストは `node --test tests/`（chrome APIとDOMのモック）。実ブラウザーのクリップボード書き込み検証とは区別する。

## Site-specific Title Selectors

新しいサイト対応を追加する場合は `mainProcessInPage` 内の `if (!title)` ブロックに追記する：

| サイト | セレクタ |
|--------|----------|
| Epson FAQ | `.faq_qstCont_ttl`, `#QuestionDescription`, `dt.question` |
| Yahoo!ニュース | `article > header > h1` |
| ESET サポート | `h2.faq_qstCont_ttl > span.icoQ` |
| Blogspot (kitaney) | `h3` |
| Google Support | `hl` パラメータ付きfetchで `h1.textContent` or `doc.title` |
