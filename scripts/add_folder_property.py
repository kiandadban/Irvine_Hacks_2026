import json, os

path = r"c:\Users\appls\OneDrive\Desktop\Irvine_Hacks_2026\models\furniture_attributes.json"

# generate folder mapping
base = r"c:\Users\appls\OneDrive\Desktop\Irvine_Hacks_2026\models"
folders = [d for d in os.listdir(base) if os.path.isdir(os.path.join(base, d))]
map_file = {}
for f in folders:
    folder = os.path.join(base, f)
    for fn in os.listdir(folder):
        if fn.lower().endswith('.fbx'):
            map_file[fn] = f

# load JSON and update
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)

changed = 0
for item in data.get('furniture_library', []):
    file = item.get('file')
    if file in map_file:
        folder = map_file[file]
        if item.get('folder') != folder:
            item['folder'] = folder
            changed += 1

with open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2)

print(f"Added folder property to {changed} items")
