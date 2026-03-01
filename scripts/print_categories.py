import json

path = r"c:\Users\appls\OneDrive\Desktop\Irvine_Hacks_2026\models\furniture_attributes.json"
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)

cats = {}
for item in data.get('furniture_library', []):
    cat = item.get('category')
    cats.setdefault(cat, []).append(item.get('name'))

for cat, names in cats.items():
    print(f"{cat} ({len(names)} items):")
    for name in names:
        print('  ', name)
    print()
