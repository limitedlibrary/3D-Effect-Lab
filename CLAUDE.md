# CLAUDE.md（Claude Code 向け作業ルール）

このリポジトリは次の役割分担で共同開発します。

| 担当 | 役割 |
|---|---|
| 利用者 | 方針決め・完成判断・マージ |
| ChatGPT（Arffi） | 設計・レビュー（GitHub Issue に作業依頼を書く） |
| Claude Code | 実装（Issue に沿って変更し、Pull Request で提案する） |

GitHub Issue が共有の作業依頼書です。ChatGPT と Claude Code は自動で会話・同期しないので、必要な情報は Issue と PR に書き残します。

## 作業の進め方

1. **作業開始時**：指定された Issue の本文・完了条件・コメントと、関連するファイルを読む。
2. **範囲を守る**：指定されていない Issue や、Issue に書かれていない機能は実装しない。曖昧な点・判断が分かれる点は、実装前に質問する。
3. **壊さない**：既存の HTML 演出（集合・破砕・出現）、物理シミュレーション、Blender 連携（JSON 出力と `app/blender/` のスクリプト）を壊さない。変更は必要最小限にし、ついでのリファクタリングや整形はしない。
4. **ブランチと PR**：原則として作業用ブランチで作業し、Pull Request で提案する。環境上できない場合は、理由と代わりの手順（パッチ・差分の共有など）を報告する。
5. **マージしない**：最終的なマージと完成判断は利用者が行う。独断で `main` へマージ・直接 push しない。
6. **秘密情報を入れない**：API キー・トークン・パスワード・認証情報はコミットしない（`.gitignore` の除外も維持する）。

## PR に書くこと

- 対応する Issue 番号（例：`Refs #1`。マージ時に Issue を自動で閉じる `Closes #1` は利用者の指示があるときに使う）
- 変更点（何をなぜ変えたか）
- 確認方法（利用者が再現できる手順）
- テスト結果（実際に行った確認と、その結果）
- 未解決事項・気になった点

## リポジトリの前提

- ビルドなし・フレームワークなしの静的 HTML/CSS/JavaScript。本体は `app/`（入口は `app/index.html`）。
- Three.js r160・Rapier・Google Fonts は CDN から読み込む（バージョンを勝手に上げない）。
- JS は `<script>` で順番に読み込む通常スクリプト（`Lab.modules` に登録する形）。ファイルを追加するときは `app/index.html` の読み込み順も確認する。
- Blender 側は `app/blender/lab_to_blender.py`（読み込み）と `verify_roundtrip.py`（検証）。JSON 形式を変えるときは HTML 側 `app/js/export/blender.js` と両方を合わせる。
- 画面・操作・JSON 形式の詳細は `app/README.md`、Blender 連携は `app/blender/README.md` を参照。仕様を変えたら該当 README も更新する。
- `*.zip`・`*.blend`・`blender-check/*_NNfps.json` は生成物なのでコミットしない。

## 確認方法の目安

自動テストはないため、変更に応じて次を行い、結果を PR に書く。

- 構文チェック（リポジトリ直下で実行）：
  - Bash：`for f in $(find app/js -name '*.js'); do node --check "$f"; done`、`python3 -m py_compile app/blender/*.py`
  - Windows PowerShell：`Get-ChildItem app/js -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }`、`Get-ChildItem app/blender/*.py | ForEach-Object { python -m py_compile $_.FullName }`
  - 何も表示されなければ成功（エラーがあるとファイル名と行番号が表示される）
- 動作確認：`cd app && python -m http.server 8000` で開き、変更した演出・シミュレーションを再生してコンソールにエラーがないことを確かめる（可能ならスクリーンショットを添える）。
- Blender 連携を変えた場合：`app/blender/README.md` の手順で往復検証を行う（Blender がない環境ではその旨を書く）。
