# Changelog

このファイルには、本プロジェクトの主な変更点を記録します。

このプロジェクトには `manifest.json` の `version` 以外に正式なバージョニング規約は
まだありません。以下の内容は Git 履歴（`git log -p -- manifest.json`、
`git show <commit>` 等）から確認できた事実のみを再構成したものです。日付はコミット日時です。

## [1.94] - 2026-09-07

### Fixed

- 拡張機能の再読み込み・再インストール時に発生することがあった
  `Cannot create item with duplicate id copy-google-en` エラーを修正。
- `chrome.runtime.onInstalled` 実行時、既存のコンテキストメニューを
  `chrome.contextMenus.removeAll()` で削除し、その完了後にメニューを
  再作成するよう変更（従来は削除処理を待たずに作成していた）。
- URLコピー処理や既存のメニュー構成に変更なし。

## [1.93] - 2026-04-18

### Changed

- Googleサポートページ（`support.google.com`、コミュニティページを除く）の
  URLクリーンアップを強化し、`?` 以降のパラメーターをすべて削除するよう変更。
- `support.google.com/s/community/` 配下は、検索クエリ等が読めるよう
  パラメーターを保持したままデコードする分岐を追加。
- クリップボードコピーのフォールバック処理（`textarea` + `execCommand`）を、
  ページコンテキスト内で完結する形に整理し、一時的な `textarea` を
  非表示にするよう改善。
- `manifest.json` に `offscreen` パーミッションを追加
  （既存の `offscreen.html`/`offscreen.js` は `background.js` からは
  未使用のまま）。

## [1.91] - 2026-03-11

### Fixed

- `chrome://` や Chrome ウェブストアなど、スクリプト実行が許可されない
  URL でのエラーを避けるガード処理を追加。

## [1.9] - 2026-02-14

### Added

- Googleサポートページのタイトルを `fetch` で取得し、英語版（`hl=en`）・
  日本語版（`hl=ja`）としてコピーするコンテキストメニューを追加。
  従来の1種類のメニューを、通常コピー用と合わせて3種類に拡張。

### Changed

- URLクリーンアップ時に `uule` に加えて `hl` パラメーターも削除するよう変更。

## [1.8] - 2026-02-12

### Added

- このGitリポジトリで確認できる最初のバージョン。ツールバーのボタンまたは
  コンテキストメニューから、タブのタイトルとデコード済みURLをコピーする
  基本機能を実装。
- Epson FAQ、Yahoo!ニュース、ESETサポート、Blogspot向けのサイト別タイトル
  取得ロジック（該当しない場合は `document.title` にフォールバック）。
- Clipboard API を優先し、失敗時は `textarea` + `execCommand` に
  フォールバックするコピー処理。
- コピーするURLから `uule` パラメーターを除去する処理。

---

README.md の「開発履歴」に記載のある v1.0〜v1.7 や v1.92 などについては、
対応する `manifest.json` の変更コミットを Git 履歴上で確認できなかったため、
本CHANGELOGには記載していません。
