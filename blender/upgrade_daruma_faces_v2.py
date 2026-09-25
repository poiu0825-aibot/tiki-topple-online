"""Give the existing nine Daruma heads distinct colors and raised face paint.

Run in the connected TikiDaruma Preview scene. The original .blend and GLB are
kept; this writes daruma-tower-v2.blend and daruma-tower-v2.glb.
"""
import bpy
import bmesh
import math
from pathlib import Path
from mathutils import Vector

BASE = Path(r"C:\Users\poiu0\Documents\Codex\2026-09-24\boardgame-io-blend-3d-games-20")
SCENE = bpy.data.scenes["TikiDaruma Preview"]
COLLECTION = bpy.data.collections["TikiDaruma Export"]
NAMES = ("Sleepy", "EyeRoll", "Smile", "Angry", "Smirk", "Sweat", "Wink", "Surprised", "Neutral")
BODY = ("#9CD337", "#FF842E", "#FFD83E", "#EF4149", "#00AF93", "#3989F3", "#8758DF", "#F06AA8", "#344360")
PAINT = ("#5143A7", "#6A35A6", "#D9433D", "#FFD858", "#FFE174", "#FF8A54", "#FFE171", "#4B3A92", "#F3E685")

assert not any(obj.name.startswith("TikiDarumaV2_") for obj in COLLECTION.objects), "v2 face paint already exists"

def rgba(hex_color):
    h = hex_color.removeprefix("#")
    values = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    values = [v/12.92 if v < .04045 else ((v+.055)/1.055)**2.4 for v in values]
    return (*values, 1)

def material(name, color):
    mat = bpy.data.materials.new("TikiDarumaV2_" + name)
    mat.use_nodes = True
    mat.diffuse_color = rgba(color)
    shader = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = rgba(color)
    shader.inputs["Roughness"].default_value = .44
    return mat

def front_y(x, z, offset=.14):
    term = 1 - (x/.69)**2 - ((z-.72)/.71)**2
    return -.56 * math.sqrt(max(.018, term)) - offset

def add_sphere(name, parent, xyz, scale, mat):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=1)
    data = bpy.data.meshes.new(name + "_mesh")
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    COLLECTION.objects.link(obj)
    obj.parent = parent
    obj.location = xyz
    obj.scale = scale
    data.materials.append(mat)
    for polygon in data.polygons:
        polygon.use_smooth = True
    return obj

def add_line(name, parent, points, mat, radius=.03, offset=.14):
    pts = [Vector((x, front_y(x,z,offset), z)) for x,z in points]
    sides = 8
    vertices, faces = [], []
    for index, point in enumerate(pts):
        tangent = (pts[min(index+1,len(pts)-1)] - pts[max(index-1,0)]).normalized()
        across = tangent.cross(Vector((0,1,0))).normalized()
        if across.length < .1:
            across = Vector((1,0,0))
        up = tangent.cross(across).normalized()
        for side in range(sides):
            angle = side * math.tau / sides
            vertices.append(tuple(point + radius * (math.cos(angle)*across + math.sin(angle)*up)))
            if index:
                a=(index-1)*sides+side
                b=(index-1)*sides+(side+1)%sides
                c=index*sides+(side+1)%sides
                d=index*sides+side
                faces.append((a,b,c,d))
    data=bpy.data.meshes.new(name+"_mesh")
    data.from_pydata(vertices,[],faces)
    data.update()
    obj=bpy.data.objects.new(name,data)
    COLLECTION.objects.link(obj)
    obj.parent=parent
    data.materials.append(mat)
    return obj

for index, name in enumerate(NAMES):
    root = bpy.data.objects[f"Tiki_{index:02d}_{name}"]
    body = bpy.data.objects[f"TikiDaruma_{name}_body"]
    base_mat = body.data.materials[0]
    base_mat.diffuse_color = rgba(BODY[index])
    shader = next(n for n in base_mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = rgba(BODY[index])
    accent = material(f"{index:02d}_paint", PAINT[index])
    for side in (-1,1):
        x=side*.39
        add_sphere(f"TikiDarumaV2_{name}_cheek_{side}",root,(x,front_y(x,.78,.15),.78),(.072,.028,.12),accent)
    # Large, different silhouette marks remain legible at game camera distance.
    if index == 0:  # sleepy crescent
        add_line(f"TikiDarumaV2_{name}_moon",root,[(-.14,1.33),(-.10,1.28),(0,1.26),(.10,1.28),(.14,1.33)],accent,.038,.09)
    elif index == 1:  # rolling spiral
        add_line(f"TikiDarumaV2_{name}_spiral",root,[(-.13,1.35),(-.03,1.39),(.10,1.35),(.12,1.29),(.03,1.27),(-.03,1.31)],accent,.038,.09)
    elif index == 2:  # sunny crown
        add_sphere(f"TikiDarumaV2_{name}_sun",root,(0,front_y(0,1.33,.1),1.33),(.09,.027,.09),accent)
        for side in (-1,1):
            add_line(f"TikiDarumaV2_{name}_ray_{side}",root,[(side*.14,1.31),(side*.22,1.38)],accent,.03,.1)
    elif index == 3:  # angry lightning
        add_line(f"TikiDarumaV2_{name}_bolt",root,[(-.09,1.42),(.04,1.35),(-.02,1.31),(.12,1.24)],accent,.05,.12)
    elif index == 4:  # smug diamond
        add_line(f"TikiDarumaV2_{name}_diamond",root,[(0,1.43),(.13,1.34),(0,1.26),(-.13,1.34),(0,1.43)],accent,.035,.1)
    elif index == 5:  # sweat droplet
        add_sphere(f"TikiDarumaV2_{name}_drop",root,(0,front_y(0,1.32,.11),1.32),(.075,.025,.125),accent)
        add_line(f"TikiDarumaV2_{name}_drop_tip",root,[(0,1.44),(-.04,1.36)],accent,.035,.11)
    elif index == 6:  # wink star
        for ray,(x,z) in enumerate(((0,1.44),(.11,1.36),(.07,1.26),(-.07,1.26),(-.11,1.36))):
            add_line(f"TikiDarumaV2_{name}_star_{ray}",root,[(0,1.33),(x,z)],accent,.033,.11)
    elif index == 7:  # surprised exclamation
        add_line(f"TikiDarumaV2_{name}_bang",root,[(0,1.43),(0,1.33)],accent,.048,.12)
        add_sphere(f"TikiDarumaV2_{name}_bang_dot",root,(0,front_y(0,1.27,.12),1.27),(.04,.024,.04),accent)
        mouth=bpy.data.objects.get("TikiDaruma_Surprised_O_mouth")
        if mouth:
            mouth.scale.x *= 1.45
            mouth.scale.z *= 1.45
    else:  # calm, ordered bars
        for row,z in enumerate((1.28,1.34,1.40)):
            add_line(f"TikiDarumaV2_{name}_bar_{row}",root,[(-.13,z),(.13,z)],accent,.028,.1)

if bpy.context.window:
    bpy.context.window.scene = SCENE
path = BASE / "assets/source/daruma-tower-v2.blend"
assert not path.exists(), "Keep the first v2 source immutable"
bpy.ops.wm.save_as_mainfile(filepath=str(path))
bpy.ops.object.select_all(action="DESELECT")
for obj in COLLECTION.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = bpy.data.objects["DarumaTowerPrototype"]
output = BASE / "public/assets/daruma-tower-v2.glb"
assert not output.exists(), "Keep the first v2 GLB immutable"
bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", use_selection=True)
print({"source":str(path),"glb":str(output),"glb_bytes":output.stat().st_size,"paint_objects":sum(obj.name.startswith("TikiDarumaV2_") for obj in COLLECTION.objects)})
