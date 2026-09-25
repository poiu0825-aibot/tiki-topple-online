"""Render transparent portraits from the exact nine Blender Daruma heads.

Run in the live Blender scene that owns DarumaTowerPrototype. The source scene
and source objects are left untouched; a temporary render scene is removed.
"""
import bpy
from mathutils import Vector
from pathlib import Path

OUTPUT = Path(r"C:\Users\poiu0\Documents\Codex\2026-09-24\boardgame-io-blend-3d-games-20\public\assets")
OUTPUT.mkdir(parents=True, exist_ok=True)
SOURCE = bpy.data.scenes.get("TikiDaruma Preview")
assert SOURCE is not None, "The original TikiDaruma Preview scene is required"
names = ["Sleepy", "EyeRoll", "Smile", "Angry", "Smirk", "Sweat", "Wink", "Surprised", "Neutral"]
roots = [SOURCE.objects.get(f"Tiki_{index:02d}_{name}") for index, name in enumerate(names)]
assert all(roots), "All nine named heads must exist in the source scene"

render_scene = bpy.data.scenes.new("DarumaPortraitRenderTemp")
render_scene.render.engine = SOURCE.render.engine
render_scene.render.resolution_x = 384
render_scene.render.resolution_y = 384
render_scene.render.resolution_percentage = 100
render_scene.render.image_settings.file_format = "PNG"
render_scene.render.image_settings.color_mode = "RGBA"
render_scene.render.film_transparent = True
render_scene.render.filepath = str(OUTPUT / "daruma-head-v2-00.png")
render_scene.view_settings.view_transform = "Standard"
render_scene.view_settings.look = "Medium High Contrast"
render_scene.world = bpy.data.worlds.new("DarumaPortraitWorldTemp")
render_scene.world.use_nodes = True
background = next(node for node in render_scene.world.node_tree.nodes if node.type == "BACKGROUND")
background.inputs[0].default_value = (0.76, 0.83, 0.8, 1)
background.inputs[1].default_value = 0.9

cam_data = bpy.data.cameras.new("DarumaPortraitCameraTemp")
camera = bpy.data.objects.new("DarumaPortraitCameraTemp", cam_data)
render_scene.collection.objects.link(camera)
camera.location = (0, -3.8, 1.04)
direction = Vector((0, 0, 0.76)) - camera.location
camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
cam_data.type = "ORTHO"
cam_data.ortho_scale = 1.85
render_scene.camera = camera

def area(name, location, power, size):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = power
    data.shape = "DISK"
    data.size = size
    item = bpy.data.objects.new(name, data)
    render_scene.collection.objects.link(item)
    item.location = location
    item.rotation_euler = (Vector((0, 0, .75)) - item.location).to_track_quat("-Z", "Y").to_euler()

area("DarumaPortraitKeyTemp", (-2.0, -3, 4), 430, 4)
area("DarumaPortraitFillTemp", (2.2, -2, 2.5), 220, 3)

copies = []
def belongs_to(object, root):
    parent = object.parent
    while parent is not None:
        if parent == root:
            return True
        parent = parent.parent
    return False

try:
    for index, root in enumerate(roots):
        originals = [root] + [obj for obj in SOURCE.objects if belongs_to(obj, root)]
        mapping = {}
        for original in originals:
            copy = original.copy()
            render_scene.collection.objects.link(copy)
            mapping[original] = copy
            copies.append(copy)
        for original, copy in mapping.items():
            copy.parent = mapping.get(original.parent)
            copy.matrix_parent_inverse = original.matrix_parent_inverse.copy()
        mapping[root].location = (0, 0, 0)
        render_scene.render.filepath = str(OUTPUT / f"daruma-head-v2-{index:02d}.png")
        bpy.ops.render.render(scene=render_scene.name, write_still=True)
        for copy in mapping.values():
            render_scene.collection.objects.unlink(copy)
            bpy.data.objects.remove(copy)
        copies.clear()
finally:
    for copy in copies:
        bpy.data.objects.remove(copy, do_unlink=True)
    bpy.data.scenes.remove(render_scene)
    bpy.data.cameras.remove(cam_data)
    print("Daruma portraits:", [str(OUTPUT / f"daruma-head-v2-{i:02d}.png") for i in range(9)])
