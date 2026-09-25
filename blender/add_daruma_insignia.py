"""Add the raised gold good-fortune emblem seen on the video reference."""

import bpy
import math

scene = bpy.data.scenes["TikiDaruma Preview"]
collection = bpy.data.collections["TikiDaruma Export"]
gold = bpy.data.materials["TikiDaruma_gold"]
font_path = r"C:\Windows\Fonts\msjhbd.ttc"
font = next((item for item in bpy.data.fonts if item.filepath == font_path), None)
if font is None:
    font = bpy.data.fonts.load(font_path)

for index, name in enumerate(("Sleepy", "EyeRoll", "Smile", "Angry", "Smirk", "Sweat", "Wink", "Surprised", "Neutral")):
    parent = bpy.data.objects[f"Tiki_{index:02d}_{name}"]
    curve = bpy.data.curves.new(f"TikiDaruma_{name}_insignia_curve", "FONT")
    curve.body = "福"
    curve.font = font
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = 0.31
    curve.extrude = 0.006
    curve.bevel_depth = 0.002
    curve.materials.append(gold)
    temporary = bpy.data.objects.new(f"TikiDaruma_{name}_insignia_text", curve)
    collection.objects.link(temporary)
    bpy.context.view_layer.update()
    mesh = bpy.data.meshes.new_from_object(temporary.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    emblem = bpy.data.objects.new(f"TikiDaruma_{name}_insignia", mesh)
    collection.objects.link(emblem)
    emblem.parent = parent
    emblem.location = (0, -0.54, 0.34)
    emblem.rotation_euler.x = math.pi / 2
    if not mesh.materials:
        mesh.materials.append(gold)
    bpy.data.objects.remove(temporary, do_unlink=True)

print({"raised_emblems": 9, "font": font.name})
