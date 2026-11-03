# -*- coding: utf-8 -*-
"""
往復検証：HTMLで出力したJSON → Blenderに読み込み → Blender上の実際の位置・回転を
Three.js の座標系に戻して、JSONの記録と比べます。

  blender -b -P verify_roundtrip.py -- 入力.json [レポート.json] [正解とする細かい記録.json]

（pip の bpy モジュールでも python verify_roundtrip.py 入力.json で動きます）
調べること
  1. 各フレームの位置・回転・スケールの誤差（シーンfpsを合わせた場合）
  2. フレームの間（x.5フレーム）での補間のずれ
  3. シーンが別のfps（24fps）のままの場合の、時刻での一致
  4. 形（寸法）と識別IDの対応
"""
import json
import math
import os
import sys

import bpy
from mathutils import Quaternion, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lab_to_blender as L  # noqa: E402


def qangle(a, b):
    """2つの向き（四元数 w,x,y,z）の角度差［度］。acos は 1 付近で精度が落ちるので差の長さから求める"""
    a = [float(x) for x in a]
    b = [float(x) for x in b]
    na, nb = math.sqrt(sum(x * x for x in a)), math.sqrt(sum(x * x for x in b))
    a, b = [x / na for x in a], [x / nb for x in b]
    d = min(math.dist(a, b), math.dist(a, [-x for x in b]))
    return math.degrees(4 * math.asin(min(1.0, d / 2)))


def sample(obj):
    loc, rot, sc = obj.matrix_world.decompose()
    return L.vec_b2t(loc), L.quat_b2t(rot), (sc.x, sc.z, sc.y)


def by_id(objs):
    return {o["lab_id"]: o for o in objs}


def check_frames(res, data, at_frame):
    scene = bpy.context.scene
    objs = by_id(res["objects"])
    pos_err = rot_err = scl_err = 0.0
    worst = None
    for o in data["objects"]:
        ob = objs[o["id"]]
        tr = o["track"]
        for i in range(len(tr["p"])):
            f = at_frame(i)
            scene.frame_set(int(math.floor(f)), subframe=f - math.floor(f))
            p, q, s = sample(ob)
            pe = max(abs(a - b) for a, b in zip(p, tr["p"][i]))
            qe = qangle((q[3], q[0], q[1], q[2]), Quaternion((tr["q"][i][3], *tr["q"][i][:3])).normalized())
            se = max(abs(a - b) for a, b in zip(s, tr["s"][i]))
            if pe > pos_err:
                pos_err, worst = pe, (o["id"], i)
            rot_err = max(rot_err, qe)
            scl_err = max(scl_err, se)
    return {"maxPositionError_m": pos_err, "maxRotationError_deg": rot_err, "maxScaleError": scl_err, "worstAt": worst}


def check_midframes(res, data):
    """x.5 フレームでの見た目と、物理ステップ間を正しく補間した値（位置は直線・回転は slerp）とのずれ"""
    scene = bpy.context.scene
    objs = by_id(res["objects"])
    pe_max = qe_max = 0.0
    for o in data["objects"]:
        ob = objs[o["id"]]
        tr = o["track"]
        for i in range(len(tr["p"]) - 1):
            f = res["frames"][i] + 0.5
            scene.frame_set(int(f), subframe=0.5)
            p, q, _ = sample(ob)
            ep = [(a + b) / 2 for a, b in zip(tr["p"][i], tr["p"][i + 1])]
            qa = Quaternion((tr["q"][i][3], *tr["q"][i][:3]))
            qb = Quaternion((tr["q"][i + 1][3], *tr["q"][i + 1][:3]))
            if qa.dot(qb) < 0:
                qb.negate()
            eq = qa.slerp(qb, 0.5)
            pe_max = max(pe_max, max(abs(a - b) for a, b in zip(p, ep)))
            qe_max = max(qe_max, qangle((q[3], q[0], q[1], q[2]), eq))
    return {"maxPositionDeviation_m": pe_max, "maxRotationDeviation_deg": qe_max}


def check_against_truth(res, data, truth):
    """細かい記録（例：60fps＝物理ステップ全部）を正解として、30fpsのキーの間に来る時刻を比べる"""
    scene = bpy.context.scene
    objs = by_id(res["objects"])
    fps, tfps = data["timing"]["fps"], truth["timing"]["fps"]
    start = res["frames"][0]
    pe_max = qe_max = 0.0
    worst = None
    for o in truth["objects"]:
        ob = objs[o["id"]]
        tr = o["track"]
        for j in range(len(tr["p"])):
            f = start + j / tfps * fps
            scene.frame_set(int(math.floor(f)), subframe=f - math.floor(f))
            p, q, _ = sample(ob)
            pe = max(abs(a - b) for a, b in zip(p, tr["p"][j]))
            qe = qangle((q[3], q[0], q[1], q[2]), (tr["q"][j][3], *tr["q"][j][:3]))
            if pe > pe_max:
                pe_max, worst = pe, (o["id"], j / tfps)
            qe_max = max(qe_max, qe)
    return {"truthFps": tfps, "maxPositionError_m": pe_max, "maxRotationError_deg": qe_max, "worstAt_id_sec": worst}


def check_shapes(res, data):
    objs = by_id(res["objects"])
    out = []
    for o in data["objects"]:
        ob = objs[o["id"]]
        sh = o["shape"]
        dims = ob.data.vertices and [max(v.co[k] for v in ob.data.vertices) - min(v.co[k] for v in ob.data.vertices) for k in range(3)]
        if sh["type"] == "cube":
            w, h, d = sh["size"]
            exp = [w, d, h]
        elif sh["type"] == "sphere":
            exp = [2 * sh["radius"]] * 3
        elif sh["type"] == "cylinder":
            exp = [2 * sh["radius"], 2 * sh["radius"], sh["height"]]
        else:
            exp = None
        err = max(abs(a - b) for a, b in zip(dims, exp)) if exp else None
        out.append({"id": o["id"], "blenderName": ob.name, "label": o["label"], "shape": sh["type"],
                    "meshDims_blender": [round(x, 6) for x in dims], "dimError": err,
                    "scale": [round(x, 6) for x in ob.scale], "verts": len(ob.data.vertices),
                    "keyframes": count_keys(ob)})
    return out


def count_keys(ob):
    ad = ob.animation_data
    from bpy_extras import anim_utils
    cb = anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot) if hasattr(anim_utils, "action_get_channelbag_for_slot") else ad.action
    fcs = cb.fcurves
    return {"fcurves": len(fcs), "keysPerCurve": len(fcs[0].keyframe_points),
            "interpolation": sorted({kp.interpolation for fc in fcs for kp in fc.keyframe_points})}


def main(src, report, truth_path=None):
    with open(src, encoding="utf-8") as fp:
        data = json.load(fp)
    out = {"source": os.path.basename(src), "blender": bpy.app.version_string,
           "fps": data["timing"]["fps"], "frameCount": data["timing"]["frameCount"], "objects": len(data["objects"])}

    # 1. シーンのfpsを合わせて読み込む
    bpy.ops.wm.read_factory_settings(use_empty=True)
    res = L.import_lab_json(src, match_scene=True)
    sc = bpy.context.scene
    out["scene"] = {"fps": sc.render.fps / sc.render.fps_base, "frame_start": sc.frame_start, "frame_end": sc.frame_end}
    out["perFrame"] = check_frames(res, data, lambda i: res["frames"][i])
    out["betweenFrames"] = check_midframes(res, data)
    out["shapes"] = check_shapes(res, data)
    if truth_path:
        with open(truth_path, encoding="utf-8") as fp:
            out["vsPhysicsSteps"] = check_against_truth(res, data, json.load(fp))
    out["ids"] = sorted(o["lab_id"] for o in res["objects"]) == sorted(o["id"] for o in data["objects"])

    # 2. シーンが 24fps のまま読み込む（制作ファイルが 24fps の場合を想定）
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 24
    res24 = L.import_lab_json(src, match_scene=False)
    out["scene24fps"] = check_frames(res24, data, lambda i: res24["frames"][i])
    out["scene24fps"]["lastKeyFrame"] = res24["frames"][-1]

    if report:
        with open(report, "w", encoding="utf-8") as fp:
            json.dump(out, fp, ensure_ascii=False, indent=1)
    print(json.dumps(out, ensure_ascii=False, indent=1))
    return out


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    main(argv[0], argv[1] if len(argv) > 1 else None, argv[2] if len(argv) > 2 else None)
