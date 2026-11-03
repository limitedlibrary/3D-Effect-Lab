# Blenderへのアニメーション出力

3D演出ラボの **シミュレーション** の動きを、Blender のキーフレーム付きオブジェクトとして持ち込むための仕組みです。
Blender で物理演算をやり直すのではなく、HTML 上で計算した動きをそのまま再生します。

| ファイル | 役割 |
|---|---|
| `../js/export/blender.js` | HTML 側：固定ステップで計算し直して、フレームごとの位置・回転・スケールを JSON に記録 |
| `lab_to_blender.py` | Blender 側：JSON を読み込んで、オブジェクトとキーフレームを作る |
| `verify_roundtrip.py` | 検証用：Blender 上の実際の位置・回転を JSON の記録と比べる |

## 使い方

1. ラボでシミュレーションのプリセットを選ぶ（検証用に「斜面の立方体と円柱」＝5秒・6個を追加しています）
2. 左パネルの **⇪ Blenderへ出力** を押す（右の欄で 30fps / 60fps / 24fps を選べます）→ JSON が保存されます
3. Blender で読み込む（どの方法でも、開いている .blend を自動で保存することはありません）
   - **画面から**：新規ファイル（File > New > General）→ Scripting タブで `lab_to_blender.py` を開いて ▶ Run Script → JSON を選ぶ
   - **アドオンとして**：Preferences > Add-ons > Install from Disk で `lab_to_blender.py` → File > Import > 「3D演出ラボ アニメーション (.json)」
   - **コマンドライン**：`blender -b -P lab_to_blender.py -- 出力.json 新しいファイル.blend`
     （既にあるファイル・開いているファイルには上書きしません。上書きするときは `--force`）
4. タイムラインで再生すると、HTML と同じ動きになります

読み込みの設定（File > Import の右側）
- **シーンのfps・範囲を合わせる**（初期値オン）：シーンを JSON の fps（30）・フレーム 1〜151 に合わせ、1フレーム＝1キーで入れます
- オフにすると、シーンの fps（例：24fps）はそのままで、時刻に合わせてキーを置きます（小数フレームのキーになります）。制作中のファイルの設定を変えたくないとき用です
- 床・障害物も作る / カメラも作る

## Blender に作られるもの

- コレクション「3D演出ラボ: プリセット名」（毎回新しく作るので、既存のオブジェクトには触れません）
  - `obj_000_球1` … 動く物体（通常のメッシュ。編集可能）。回転モードは四元数、キーは全フレーム・リニア補間
  - 子コレクション「環境（動かない）」… 床（ワイヤー表示）・壁（ワイヤー表示・レンダーしない）・斜面・柱・箱
  - `lab_カメラ` … HTML の視点と同じ位置・画角のカメラ
- 各オブジェクトのカスタムプロパティ：`lab_id`（識別ID）、`lab_label`、`lab_shape`、`lab_mass`、`lab_restitution`、`lab_friction`
  （名前が重複して `.001` が付いても `lab_id` で対応が取れます）

## 座標系・回転・時間の変換

| | HTML（Three.js） | Blender | 変換 |
|---|---|---|---|
| 上方向 | +Y | +Z | 位置 (x, y, z) → (x, −z, y) |
| 回転 | 四元数 (x, y, z, w) | 四元数 (w, x, y, z) | (x, y, z, w) → (w, x, −z, y) |
| スケール | (x, y, z) | | (x, z, y) |
| 単位 | 1 = 1m | 1 = 1m | そのまま |
| 時間 | 物理は 1/60秒刻み | シーンの fps | 30fps なら 2ステップごと（ぴったり）。24fps は隣のステップ間を補間 |

- 隣り合うフレームで四元数の符号（q と −q は同じ向き）をそろえてから入れるので、補間で一瞬ぐるっと回ることはありません
- キーはリニア補間です。ベジェ補間（Blender の初期値）だと、キーとキーの間で動きがふくらんで元の動きからずれるためです

## 結果を左右しないための工夫

- 出力時は、画面のプレビューとは別に物理ワールドを作り、設定と乱数の種から **初期状態を作り直して** 1/60 秒の固定ステップで計算します。表示のフレームレート・再生速度・一時停止やシークの操作は結果に影響しません
- 乱数はすべて乱数の種（`seed`）から決まり、JSON の `source.seed` / `source.params` に記録されます
- Blender 側は記録した値を再生するだけなので、Blender のバージョンや PC が違っても同じ動きになります

## 検証方法

```
blender -b -P verify_roundtrip.py -- 出力_30fps.json レポート.json [出力_60fps.json]
```
3つ目に 60fps で出力した JSON を渡すと、30fps のキーとキーの間（物理の途中ステップ）とのずれも測れます。

## JSON の形（format: `3d-lab-blender-anim`, version 1）

```json
{
  "format": "3d-lab-blender-anim", "version": 1,
  "source": { "preset": {...}, "seed": 1, "params": {...}, "physics": { "engine": "rapier3d-compat@0.14.0", "step": 0.0166 } },
  "coordinateSystem": { "up": "Y", "handedness": "right", "unit": "meter" },
  "timing": { "fps": 30, "duration": 5, "frameCount": 151, "physicsStepsPerFrame": 2, "sampling": "exact-physics-steps" },
  "objects": [{
    "id": "obj_000", "label": "球1",
    "shape": { "type": "sphere", "radius": 0.5, "segments": 32, "rings": 20 },
    "materials": [{ "name": "face", "color": "#9fd8ff", "metalness": 0.35, "roughness": 0.38 }],
    "physics": { "mass": 1, "restitution": 0.3, "friction": 0.4, "colliders": [...] },
    "track": { "p": [[x,y,z], ...], "q": [[x,y,z,w], ...], "s": [[x,y,z], ...] }
  }],
  "environment": [{ "id": "env_00", "role": "floor", "shape": {...}, "position": [...], "quaternion": [...] }],
  "camera": { "fov": 40, "aspect": 1.16, "position": [...], "target": [...] }
}
```
`shape.type` は `cube` / `sphere` / `cylinder`（Blender でもきれいな基本図形として作成）と `mesh`（文字。頂点と三角形をそのまま渡す）です。
