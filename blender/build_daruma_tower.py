"""Build a nine-head Daruma tower prototype in the connected Blender scene.

The scene and all generated objects have a dedicated prefix. The default scene
and the user's other Blender objects are left intact.
"""

import bpy
import bmesh
import math
from mathutils import Vector

PREFIX = "TikiDaruma"
SCENE_NAME = f"{PREFIX} Preview"
PALETTE = [
    ("Sleepy", "#96c86c", "sleepy"),
    ("EyeRoll", "#e8a159", "roll"),
    ("Smile", "#f0cd68", "smile"),
    ("Angry", "#61bd78", "angry"),
    ("Smirk", "#48b2a6", "smirk"),
    ("Sweat", "#72a9db", "sweat"),
    ("Wink", "#aa85ca", "wink"),
    ("Surprised", "#dc7979", "surprised"),
    ("Neutral", "#82c5c9", "neutral"),
]


def rgba(hex_color):
    h = hex_color.lstrip("#")
    values = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    # Blender's shader colors are linear; convert sRGB values for a visual match.
    values = [v / 12.92 if v < 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in values]
    return (*values, 1.0)


def material(name, color, metallic=0.0, roughness=0.45):
    mat = bpy.data.materials.new(f"{PREFIX}_{name}")
    mat.use_nodes = True
    mat.diffuse_color = rgba(color)
    shader = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = rgba(color)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return mat


def new_mesh(name, vertices, faces, mat, parent):
    mesh = bpy.data.meshes.new(f"{PREFIX}_{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(f"{PREFIX}_{name}", mesh)
    collection.objects.link(obj)
    obj.parent = parent
    mesh.materials.append(mat)
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj


def sphere(name, center, scale, mat, parent, segments=28, rings=18):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1.0)
    mesh = bpy.data.meshes.new(f"{PREFIX}_{name}_mesh")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(f"{PREFIX}_{name}", mesh)
    collection.objects.link(obj)
    obj.parent = parent
    obj.location = center
    obj.scale = scale
    mesh.materials.append(mat)
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj


def body_front_y(x, z, offset=0.0):
    term = 1.0 - (x / 0.69) ** 2 - ((z - 0.72) / 0.71) ** 2
    return -0.56 * math.sqrt(max(0.018, term)) - offset


def face_patch(name, width, height, center_z, mat, parent, offset):
    segments = 32
    rings = 7
    vertices = []
    faces = []
    for ring in range(rings + 1):
        radius = max(0.001, ring / rings)
        for step in range(segments):
            angle = step * math.tau / segments
            x = width * radius * math.cos(angle)
            z = center_z + height * radius * math.sin(angle)
            vertices.append((x, body_front_y(x, z, offset), z))
            if ring:
                prev = (ring - 1) * segments + step
                curr = ring * segments + step
                prev_next = (ring - 1) * segments + (step + 1) % segments
                curr_next = ring * segments + (step + 1) % segments
                faces.append((prev, prev_next, curr_next, curr))
    return new_mesh(name, vertices, faces, mat, parent)


def tube(name, points, radius, mat, parent, sides=7):
    pts = [Vector(point) for point in points]
    vertices = []
    faces = []
    for i, point in enumerate(pts):
        tangent = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        side = tangent.cross(Vector((0, 1, 0))).normalized()
        if side.length < 0.1:
            side = Vector((1, 0, 0))
        up = tangent.cross(side).normalized()
        for j in range(sides):
            angle = j * math.tau / sides
            vertices.append(tuple(point + radius * (math.cos(angle) * side + math.sin(angle) * up)))
            if i:
                a = (i - 1) * sides + j
                b = (i - 1) * sides + (j + 1) % sides
                c = i * sides + (j + 1) % sides
                d = i * sides + j
                faces.append((a, b, c, d))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple((len(pts) - 1) * sides + j for j in range(sides)))
    return new_mesh(name, vertices, faces, mat, parent)


def line(name, xz_points, radius, mat, parent, forward=0.08):
    return tube(name, [(x, body_front_y(x, z, forward), z) for x, z in xz_points], radius, mat, parent)


def eye(parent, label, x, z, mode="open", pupil_dx=0.0, pupil_dz=0.0, size=1.0):
    if mode == "closed":
        line(f"{label}_lid", [(x - 0.11, z), (x - 0.055, z - 0.026), (x, z - 0.033), (x + 0.06, z - 0.02), (x + 0.11, z + 0.015)], 0.019, ink, parent, 0.097)
        return
    white = sphere(f"{label}_white", (x, body_front_y(x, z, 0.085), z), (0.115 * size, 0.054, 0.129 * size), ivory, parent, 20, 12)
    pupil = sphere(f"{label}_pupil", (x + pupil_dx, white.location.y - 0.052, z + pupil_dz), (0.052 * size, 0.027, 0.057 * size), ink, parent, 16, 10)
    sphere(f"{label}_shine", (pupil.location.x - 0.017, pupil.location.y - 0.029, pupil.location.z + 0.022), (0.014, 0.008, 0.016), ivory, parent, 10, 8)
    if mode == "half":
        line(f"{label}_half_lid", [(x - 0.12, z + 0.04), (x, z + 0.025), (x + 0.12, z + 0.04)], 0.024, ink, parent, 0.16)


def smile(parent, label, skew=0.0):
    line(label, [(-0.22, 0.66 + skew), (-0.12, 0.58), (0.02, 0.55), (0.16, 0.59), (0.23, 0.67 - skew)], 0.023, ink, parent, 0.102)


def frown(parent, label):
    line(label, [(-0.20, 0.57), (-0.09, 0.64), (0.07, 0.67), (0.2, 0.58)], 0.026, ink, parent, 0.102)


def make_face(parent, expression, label):
    face_patch(f"{label}_face_trim", 0.53, 0.41, 0.91, face_border, parent, 0.023)
    face_patch(f"{label}_face", 0.495, 0.375, 0.91, ivory, parent, 0.045)
    for side in (-1, 1):
        sphere(f"{label}_cheek_{side}", (0.39 * side, body_front_y(0.39, 0.7, 0.07), 0.7), (0.105, 0.022, 0.065), cheek, parent, 16, 10)
        line(f"{label}_brow_{side}", [(side * 0.11, 1.205), (side * 0.19, 1.27), (side * 0.28, 1.24), (side * 0.34, 1.18)], 0.032, ink, parent, 0.097)
    if expression == "sleepy":
        eye(parent, f"{label}_L", -0.21, 1.04, "closed")
        eye(parent, f"{label}_R", 0.21, 1.04, "closed")
        line(f"{label}_mouth", [(-0.09, 0.63), (0.0, 0.61), (0.09, 0.63)], 0.019, ink, parent, 0.102)
    elif expression == "roll":
        eye(parent, f"{label}_L", -0.21, 1.04, pupil_dz=0.05)
        eye(parent, f"{label}_R", 0.21, 1.04, pupil_dz=0.05)
        line(f"{label}_mouth", [(-0.17, 0.62), (0.0, 0.59), (0.17, 0.62)], 0.021, ink, parent, 0.102)
    elif expression == "smile":
        eye(parent, f"{label}_L", -0.21, 1.04, "closed")
        eye(parent, f"{label}_R", 0.21, 1.04, "closed")
        smile(parent, f"{label}_smile")
    elif expression == "angry":
        eye(parent, f"{label}_L", -0.21, 1.04, pupil_dx=0.02)
        eye(parent, f"{label}_R", 0.21, 1.04, pupil_dx=-0.02)
        line(f"{label}_angry_L", [(-0.36, 1.28), (-0.19, 1.18), (-0.09, 1.16)], 0.039, ink, parent, 0.13)
        line(f"{label}_angry_R", [(0.09, 1.16), (0.19, 1.18), (0.36, 1.28)], 0.039, ink, parent, 0.13)
        frown(parent, f"{label}_frown")
    elif expression == "smirk":
        eye(parent, f"{label}_L", -0.21, 1.04, "half", pupil_dx=0.01)
        eye(parent, f"{label}_R", 0.21, 1.04, pupil_dx=-0.02)
        smile(parent, f"{label}_smirk", 0.06)
    elif expression == "sweat":
        eye(parent, f"{label}_L", -0.21, 1.04, pupil_dx=0.025, pupil_dz=-0.03)
        eye(parent, f"{label}_R", 0.21, 1.04, pupil_dx=0.025, pupil_dz=-0.03)
        sphere(f"{label}_sweat", (0.44, body_front_y(0.44, 1.08, 0.1), 1.08), (0.037, 0.022, 0.085), sweat_blue, parent, 14, 10)
        frown(parent, f"{label}_worried")
    elif expression == "wink":
        eye(parent, f"{label}_L", -0.21, 1.04, "closed")
        eye(parent, f"{label}_R", 0.21, 1.04)
        smile(parent, f"{label}_wink")
    elif expression == "surprised":
        eye(parent, f"{label}_L", -0.21, 1.04, size=1.16)
        eye(parent, f"{label}_R", 0.21, 1.04, size=1.16)
        sphere(f"{label}_O_mouth", (0, body_front_y(0, 0.63, 0.11), 0.63), (0.074, 0.025, 0.087), ink, parent, 18, 10)
    else:
        eye(parent, f"{label}_L", -0.21, 1.04)
        eye(parent, f"{label}_R", 0.21, 1.04)
        line(f"{label}_neutral", [(-0.13, 0.62), (0.0, 0.62), (0.13, 0.62)], 0.022, ink, parent, 0.102)
    line(f"{label}_nose_L", [(-0.09, 0.82), (-0.07, 0.87), (-0.02, 0.88)], 0.015, red_accent, parent, 0.105)
    line(f"{label}_nose_R", [(0.02, 0.88), (0.07, 0.87), (0.09, 0.82)], 0.015, red_accent, parent, 0.105)


def make_doll(index, name, color, expression):
    doll = bpy.data.objects.new(f"Tiki_{index:02d}_{name}", None)
    collection.objects.link(doll)
    doll.parent = root
    doll.location.z = index * 1.18
    body_mat = material(f"body_{index:02d}", color, metallic=0.16, roughness=0.31)
    sphere(f"{name}_body", (0, 0, 0.72), (0.69, 0.56, 0.71), body_mat, doll, 36, 24)
    # A darker weighted base makes the silhouette read as a roly-poly doll.
    sphere(f"{name}_base", (0, 0, 0.17), (0.61, 0.51, 0.18), dark_base, doll, 28, 14)
    line(f"{name}_gold_left", [(-0.51, 0.49), (-0.58, 0.66), (-0.56, 0.84), (-0.5, 1.02)], 0.025, gold, doll, 0.052)
    line(f"{name}_gold_right", [(0.51, 0.49), (0.58, 0.66), (0.56, 0.84), (0.5, 1.02)], 0.025, gold, doll, 0.052)
    line(f"{name}_gold_belly", [(-0.25, 0.32), (-0.13, 0.26), (0, 0.23), (0.13, 0.26), (0.25, 0.32)], 0.024, gold, doll, 0.09)
    make_face(doll, expression, name)
    return doll


existing = bpy.data.scenes.get(SCENE_NAME)
if existing:
    raise RuntimeError(f"{SCENE_NAME} already exists; preserve it before rebuilding")

scene = bpy.data.scenes.new(SCENE_NAME)
if bpy.context.window:
    bpy.context.window.scene = scene
collection = bpy.data.collections.new(f"{PREFIX} Export")
scene.collection.children.link(collection)
root = bpy.data.objects.new("DarumaTowerPrototype", None)
collection.objects.link(root)

ivory = material("ivory", "#f6efe3", roughness=0.54)
face_border = material("face_border", "#4a2d26", roughness=0.6)
ink = material("ink", "#242227", roughness=0.45)
gold = material("gold", "#e7ba67", metallic=0.72, roughness=0.3)
cheek = material("cheek", "#cb726e", roughness=0.58)
red_accent = material("red_accent", "#c74e48", roughness=0.42)
sweat_blue = material("sweat_blue", "#9be5f5", roughness=0.3)
dark_base = material("dark_base", "#5c403b", roughness=0.6)

for index, (name, color, expression) in enumerate(PALETTE):
    make_doll(index, name, color, expression)

print({"scene": scene.name, "dolls": len(PALETTE), "objects": len(collection.objects), "height": 8 * 1.18 + 1.43})
