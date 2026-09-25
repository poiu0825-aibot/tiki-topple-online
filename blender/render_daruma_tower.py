"""Add a non-exported studio setup and render the Blender tower prototype."""

import bpy
import math
import os
from mathutils import Vector

scene = bpy.data.scenes["TikiDaruma Preview"]
studio = bpy.data.collections.new("TikiDaruma Studio Only")
scene.collection.children.link(studio)


def studio_material(name, color, metallic=0, roughness=0.5):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return material


ground_mat = studio_material("TikiDaruma Studio Ground", (0.025, 0.052, 0.045, 1), roughness=0.8)
pedestal_mat = studio_material("TikiDaruma Studio Pedestal", (0.14, 0.10, 0.06, 1), metallic=0.25, roughness=0.47)

bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.12))
ground = bpy.context.object
ground.name = "TikiDaruma Studio Floor"
for collection in list(ground.users_collection):
    collection.objects.unlink(ground)
studio.objects.link(ground)
ground.data.materials.append(ground_mat)

bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=0.95, depth=0.22, location=(0, 0, -0.07))
pedestal = bpy.context.object
pedestal.name = "TikiDaruma Studio Pedestal"
for collection in list(pedestal.users_collection):
    collection.objects.unlink(pedestal)
studio.objects.link(pedestal)
pedestal.data.materials.append(pedestal_mat)
for polygon in pedestal.data.polygons:
    polygon.use_smooth = True

camera_data = bpy.data.cameras.new("TikiDaruma Preview Camera")
camera = bpy.data.objects.new("TikiDaruma Preview Camera", camera_data)
studio.objects.link(camera)
camera.location = (7.8, -17, 8.2)
camera.rotation_euler = (Vector((0, 0, 5.25)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = 12.4
scene.camera = camera

for name, location, power, size, color in [
    ("Key", (-5, -8, 14), 1800, 8, (1.0, 0.88, 0.72)),
    ("Fill", (5, -2, 8), 1000, 7, (0.65, 0.84, 1.0)),
    ("Rim", (1, 6, 12), 2200, 6, (1.0, 0.82, 0.54)),
]:
    light_data = bpy.data.lights.new(f"TikiDaruma {name}", "AREA")
    light_data.energy = power
    light_data.shape = "DISK"
    light_data.size = size
    light_data.color = color
    light = bpy.data.objects.new(f"TikiDaruma {name}", light_data)
    studio.objects.link(light)
    light.location = location
    light.rotation_euler = (Vector((0, 0, 5)) - light.location).to_track_quat("-Z", "Y").to_euler()

world = bpy.data.worlds.new("TikiDaruma Preview World")
world.use_nodes = True
background = next(node for node in world.node_tree.nodes if node.type == "BACKGROUND")
background.inputs["Color"].default_value = (0.12, 0.18, 0.15, 1)
background.inputs["Strength"].default_value = 0.65
scene.world = world

scene.render.resolution_x = 900
scene.render.resolution_y = 1400
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
    scene.eevee.taa_render_samples = 32
output = r"C:\Users\poiu0\Documents\Codex\2026-09-24\boardgame-io-blend-3d-games-20\assets\preview\daruma-tower-blender.png"
os.makedirs(os.path.dirname(output), exist_ok=True)
scene.render.filepath = output
bpy.ops.render.render(scene=scene.name, write_still=True)
print({"output": output, "bytes": os.path.getsize(output), "engine": scene.render.engine})
