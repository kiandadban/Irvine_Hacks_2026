import os, json
base = r"c:\Users\appls\OneDrive\Desktop\Irvine_Hacks_2026\models"
folders = [d for d in os.listdir(base) if os.path.isdir(os.path.join(base, d))]
map_file = {}
for f in folders:
    folder = os.path.join(base, f)
    for fn in os.listdir(folder):
        if fn.lower().endswith('.fbx'):
            map_file[fn] = f

print(json.dumps(map_file, indent=2))
