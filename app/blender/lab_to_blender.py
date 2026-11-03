# -*- coding: utf-8 -*-
"""
3D演出ラボ → Blender アニメーション読み込みスクリプト

HTMLの「⇪ Blenderへ出力」で保存したJSON（format: 3d-lab-blender-anim）を読み込み、
物体ごとに通常の編集可能なメッシュオブジェクトを作って、各フレームの位置・回転・スケールを
キーフレームとして入れます。物理演算はBlender側では再計算しません（記録した動きをそのまま再生）。

使い方は3通り（どれも開いている .blend ファイルを自動で保存することはありません）：

1) Blender の画面から（いちばん簡単）
   Scripting タブ → テキストエディタでこのファイルを開く → ▶ Run Script
   → ファイル選択画面でJSONを選ぶ。新しいコレクション「3D演出ラボ: ○○」に読み込まれます。
   ※制作中のファイルに直接入れず、新規ファイル（File > New > General）で試すのがおすすめです。

2) アドオンとして
   Edit > Preferences > Add-ons > Install from Disk でこのファイルを選ぶ
   → File > Import > 「3D演出ラボ アニメーション (.json)」

3) コマンドラインから（新しい .blend を作る）
   blender -b -P lab_to_blender.py -- 入力.json 出力.blend
   - .blend を指定せずに起動すると空のシーンから作ります
   - 出力先が開いているファイルと同じ場合や、既にある場合は上書きしません（--force で上書き）

座標系の変換（Three.js: Y が上 → Blender: Z が上。どちらも右手系・1単位 = 1m）
   位置     (x, y, z)    → (x, -z, y)
   四元数   (x, y, z, w) → (w, x, -z, y)
   スケール (x, y, z)    → (x, z, y)
"""

bl_info = {
    "name": "3D演出ラボ アニメーション読み込み",
    "author": "3D演出ラボ",
    "version": (1, 0, 0),
    "blender": (4, 2, 0),
    "location": "File > Import > 3D演出ラボ アニメーション (.json)",
    "description": "3D演出ラボのシミュレーション結果を、キーフレーム付きのオブジェクトとして読み込みます",
    "category": "Import-Export",
}

import json
import math
import os
import sys

import bpy
import bmesh
from mathutils import Quaternion, Vector

FORMAT = "3d-lab-blender-anim"


# ---------------------------------------------------------------- 座標系の変換
def vec_t2b(v):
    x, y, z = v
    return Vector((x, -z, y))


def quat_t2b(q):
    x, y, z, w = q
    return Quaternion((w, x, -z, y))


def scale_t2b(s):
    x, y, z = s
    return Vector((x, z, y))


def vec_b2t(v):
    return (v.x, v.z, -v.y)


def quat_b2t(q):
    return (q.x, q.z, -q.y, q.w)


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear(h):
    h = h.lstrip("#")
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


# ---------------------------------------------------------------- 形状
def build_mesh(name, shape):
    """Three.js 側と同じ形・同じ分割数のメッシュを Blender の座標系で作る"""
    bm = bmesh.new()
    smooth = False
    t = shape["type"]
    if t == "cube":
        w, h, d = shape["size"]
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co = Vector((v.co.x * w, v.co.y * d, v.co.z * h))  # Three の (幅, 高さ, 奥行) → Blender の (X, Y, Z)
    elif t == "sphere":
        # Three の SphereGeometry（極は Y 軸）→ Blender の UV球（極は Z 軸）。分割数も合わせる
        bmesh.ops.create_uvsphere(bm, u_segments=shape.get("segments", 32), v_segments=shape.get("rings", 20),
                                  radius=shape["radius"])
        smooth = True
    elif t == "cylinder":
        # Three の CylinderGeometry（軸は Y）→ Blender の円柱（軸は Z）
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=shape.get("segments", 32),
                              radius1=shape["radius"], radius2=shape["radius"], depth=shape["height"])
        smooth = True
    elif t == "mesh":
        m = shape["mesh"]
        vs, tris, mats = m["vertices"], m["triangles"], m.get("materialIndex") or []
        verts = [bm.verts.new(vec_t2b(vs[i:i + 3])) for i in range(0, len(vs), 3)]
        for k in range(0, len(tris), 3):
            try:
                f = bm.faces.new((verts[tris[k]], verts[tris[k + 1]], verts[tris[k + 2]]))
                f.material_index = mats[k // 3] if k // 3 < len(mats) else 0
            except ValueError:
                pass  # 同じ頂点の組み合わせの面（重複）は飛ばす
        # Three.js では面ごとに頂点が分かれているので、同じ位置の頂点をつないで編集しやすくする（形は変わらない）
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    else:
        raise ValueError("未対応の形: %s" % t)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        me.shade_smooth()
        if hasattr(me, "set_sharp_from_angle"):
            me.set_sharp_from_angle(angle=math.radians(30))  # 円柱のふたの縁は角を立てる
    return me


def make_material(name, spec):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = hex_to_linear(spec["color"])
        bsdf.inputs["Metallic"].default_value = spec.get("metalness", 0.0)
        bsdf.inputs["Roughness"].default_value = spec.get("roughness", 0.5)
    mat.diffuse_color = hex_to_linear(spec["color"])  # ビューポート（ソリッド表示）の色
    return mat


# ---------------------------------------------------------------- キーフレーム
def ensure_fcurve(obj, action, path, index, group):
    if hasattr(action, "fcurve_ensure_for_datablock"):  # Blender 4.4 以降（スロット付きアクション）
        return action.fcurve_ensure_for_datablock(obj, path, index=index, group_name=group)
    fc = action.fcurves.find(path, index=index)
    return fc or action.fcurves.new(path, index=index, action_group=group)


def write_channel(obj, action, path, frames, values, group):
    """values: フレームごとのベクトル。全フレームにキーを打ち、補間はリニアにする"""
    n = len(frames)
    for axis in range(len(values[0])):
        fc = ensure_fcurve(obj, action, path, axis, group)
        fc.keyframe_points.add(n)
        co = []
        for f, v in zip(frames, values):
            co += (f, v[axis])
        fc.keyframe_points.foreach_set("co", co)
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"  # ベジェだと前後のキーの間でふくらんで、元の動きからずれる
        fc.update()


def continuous_quats(qs):
    """q と -q は同じ向き。隣のフレームと符号をそろえないと、補間が遠回りして一瞬回転して見える"""
    out, prev = [], None
    for q in qs:
        q = q.normalized()
        if prev is not None and prev.dot(q) < 0:
            q.negate()
        out.append(q)
        prev = q
    return out


# ---------------------------------------------------------------- 読み込み本体
def import_lab_json(path, context=None, match_scene=True, start_frame=1, with_environment=True, with_camera=True):
    """
    match_scene=True : シーンの fps・開始/終了フレームを書き出したデータに合わせる（1フレーム=1キー）
    match_scene=False: シーンの fps はそのまま。時刻 t のキーを start_frame + t × シーンfps に置く（小数フレームになる）
    """
    context = context or bpy.context
    with open(path, "r", encoding="utf-8") as fp:
        data = json.load(fp)
    if data.get("format") != FORMAT:
        raise ValueError("3D演出ラボのBlender用JSONではありません（format: %s）" % data.get("format"))
    if data.get("version", 0) > 1:
        print("[3D演出ラボ] 新しい版のJSONです。読める範囲で読み込みます")

    scene = context.scene
    timing = data["timing"]
    fps = timing["fps"]
    count = timing["frameCount"]

    if match_scene:
        scene.render.fps = int(round(fps))
        scene.render.fps_base = scene.render.fps / fps
        scene.frame_start = start_frame
        scene.frame_end = start_frame + count - 1
        frames = [start_frame + i for i in range(count)]
    else:
        scene_fps = scene.render.fps / scene.render.fps_base
        frames = [start_frame + (i / fps) * scene_fps for i in range(count)]

    src = data.get("source") or {}
    preset = src.get("preset") or {}
    title = preset.get("name") or os.path.splitext(os.path.basename(path))[0]
    root = bpy.data.collections.new("3D演出ラボ: %s" % title)
    scene.collection.children.link(root)
    root["lab_source_file"] = os.path.basename(path)
    root["lab_exported_at"] = data.get("exportedAt", "")
    root["lab_fps"] = fps
    root["lab_seed"] = src.get("seed", 0)

    created = []
    for o in data["objects"]:
        name = "%s_%s" % (o["id"], o.get("label", ""))
        me = build_mesh(name, o["shape"])
        for i, spec in enumerate(o.get("materials") or []):
            me.materials.append(make_material("%s_%s" % (name, spec.get("name", i)), spec))
        obj = bpy.data.objects.new(name, me)
        root.objects.link(obj)
        # 物体ごとの識別ID（名前が重複して .001 が付いても、こちらで照合できる）
        obj["lab_id"] = o["id"]
        obj["lab_index"] = o.get("index", 0)
        obj["lab_label"] = o.get("label", "")
        obj["lab_shape"] = o["shape"]["type"]
        ph = o.get("physics") or {}
        for k in ("mass", "restitution", "friction"):
            if k in ph:
                obj["lab_" + k] = ph[k]

        tr = o["track"]
        locs = [vec_t2b(p) for p in tr["p"]]
        quats = continuous_quats([quat_t2b(q) for q in tr["q"]])
        scales = [scale_t2b(s) for s in tr["s"]]
        obj.rotation_mode = "QUATERNION"
        obj.location, obj.rotation_quaternion, obj.scale = locs[0], quats[0], scales[0]

        obj.animation_data_create()
        action = bpy.data.actions.new("%s_Action" % name)
        obj.animation_data.action = action
        group = o["id"]
        write_channel(obj, action, "location", frames, locs, group)
        write_channel(obj, action, "rotation_quaternion", frames, quats, group)
        if len(scales) > 1 and any((s - scales[0]).length > 1e-9 for s in scales):
            write_channel(obj, action, "scale", frames, scales, group)  # 大きさが変わるときだけキーを打つ
        created.append(obj)

    if with_environment and data.get("environment"):
        env = bpy.data.collections.new("環境（動かない）")
        root.children.link(env)
        env_mat = make_material("lab_環境", {"color": "#3b4354", "roughness": 0.75, "metalness": 0.1})
        for e in data["environment"]:
            name = "%s_%s" % (e["id"], {"floor": "床", "wall": "壁", "obstacle": "障害物"}.get(e["role"], e["role"]))
            me = build_mesh(name, e["shape"])
            me.materials.append(env_mat)
            obj = bpy.data.objects.new(name, me)
            env.objects.link(obj)
            obj["lab_id"] = e["id"]
            obj["lab_role"] = e["role"]
            obj.rotation_mode = "QUATERNION"
            obj.location = vec_t2b(e["position"])
            obj.rotation_quaternion = quat_t2b(e["quaternion"])
            if e["role"] == "wall":
                obj.display_type = "WIRE"
                obj.hide_render = True
            if e["role"] == "floor":
                obj.display_type = "WIRE"

    cam_obj = None
    if with_camera and data.get("camera"):
        c = data["camera"]
        cam = bpy.data.cameras.new("lab_カメラ")
        cam.sensor_fit = "VERTICAL"  # Three.js の fov は縦の画角
        cam.angle_y = math.radians(c["fov"])
        cam_obj = bpy.data.objects.new("lab_カメラ", cam)
        root.objects.link(cam_obj)
        pos, target = vec_t2b(c["position"]), vec_t2b(c["target"])
        cam_obj.location = pos
        cam_obj.rotation_mode = "QUATERNION"
        cam_obj.rotation_quaternion = (target - pos).to_track_quat("-Z", "Y")
        cam_obj["lab_id"] = "camera"
        if match_scene and c.get("aspect"):
            scene.render.resolution_x = 1920
            scene.render.resolution_y = int(round(1920 / c["aspect"] / 2)) * 2

    scene.frame_set(int(frames[0]))
    print("[3D演出ラボ] %d個のオブジェクトを %d フレーム（%s fps）で読み込みました" % (len(created), count, fps))
    return {"collection": root, "objects": created, "camera": cam_obj, "frames": frames, "data": data}


# ---------------------------------------------------------------- メニュー（File > Import）
try:
    from bpy_extras.io_utils import ImportHelper
    from bpy.props import BoolProperty, IntProperty, StringProperty

    class IMPORT_SCENE_OT_lab_anim(bpy.types.Operator, ImportHelper):
        """3D演出ラボで出力したアニメーション（JSON）を読み込む"""
        bl_idname = "import_scene.lab_anim"
        bl_label = "3D演出ラボ アニメーションを読み込む"
        bl_options = {"REGISTER", "UNDO"}

        filename_ext = ".json"
        filter_glob: StringProperty(default="*.json", options={"HIDDEN"})
        match_scene: BoolProperty(name="シーンのfps・範囲を合わせる", default=True,
                                  description="オフにするとシーンのfpsはそのままで、時刻に合わせてキーを置きます")
        start_frame: IntProperty(name="開始フレーム", default=1)
        with_environment: BoolProperty(name="床・障害物も作る", default=True)
        with_camera: BoolProperty(name="カメラも作る", default=True)

        def execute(self, context):
            try:
                r = import_lab_json(self.filepath, context, self.match_scene, self.start_frame,
                                    self.with_environment, self.with_camera)
            except Exception as e:  # noqa: BLE001
                self.report({"ERROR"}, str(e))
                return {"CANCELLED"}
            self.report({"INFO"}, "%d個のオブジェクトを読み込みました" % len(r["objects"]))
            return {"FINISHED"}

    def _menu(self, context):
        self.layout.operator(IMPORT_SCENE_OT_lab_anim.bl_idname, text="3D演出ラボ アニメーション (.json)")

    def register():
        bpy.utils.register_class(IMPORT_SCENE_OT_lab_anim)
        bpy.types.TOPBAR_MT_file_import.append(_menu)

    def unregister():
        bpy.types.TOPBAR_MT_file_import.remove(_menu)
        bpy.utils.unregister_class(IMPORT_SCENE_OT_lab_anim)
except Exception:  # bpy を部品として読み込むだけの環境
    register = unregister = None


# ---------------------------------------------------------------- コマンドライン
def _cli(argv):
    args = [a for a in argv if not a.startswith("--")]
    force = "--force" in argv
    if len(args) < 2:
        print("使い方: blender -b -P lab_to_blender.py -- 入力.json 出力.blend [--force]")
        return 1
    src, out = os.path.abspath(args[0]), os.path.abspath(args[1])
    opened = bpy.data.filepath and os.path.abspath(bpy.data.filepath)
    if opened and opened == out:
        print("出力先が開いているファイルと同じです。元のファイルは変更しません。別の名前を指定してください。")
        return 1
    if os.path.exists(out) and not force:
        print("出力先が既にあります（上書きするなら --force）: %s" % out)
        return 1
    if not opened:
        bpy.ops.wm.read_factory_settings(use_empty=True)
    import_lab_json(src)
    bpy.ops.wm.save_as_mainfile(filepath=out, copy=True)  # copy=True：開いているファイルの保存先は変えない
    print("保存しました: %s" % out)
    return 0


if __name__ == "__main__":
    if "--" in sys.argv:
        sys.exit(_cli(sys.argv[sys.argv.index("--") + 1:]))
    elif not bpy.app.background:
        # テキストエディタから実行：メニューに登録して、ファイル選択画面を開く
        try:
            unregister()
        except Exception:
            pass
        register()
        bpy.ops.import_scene.lab_anim("INVOKE_DEFAULT")
