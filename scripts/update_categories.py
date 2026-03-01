import json

path = r"c:\Users\appls\OneDrive\Desktop\Irvine_Hacks_2026\models\furniture_attributes.json"
with open(path,'r',encoding='utf-8') as f:
    data = json.load(f)

mapping = {
    'Bathroom':'bathroom',
    'Beds':'bedroom',
    'Carpets':'living room',
    'Chairs':'living room',
    'Doors':'living room',
    'Drawers':'bedroom',
    'Electronics':'office',
    'Kitchen':'kitchen',
    'Lights':'living room',
    'Miscellaneous':'living room',
    'Shelves':'living room',
    'Sofas':'living room',
    'Tables':'living room',
    'Windows':'living room'
}

count = 0
for item in data.get('furniture_library', []):
    cat = item.get('category')
    if cat in mapping:
        item['category'] = mapping[cat]
        count += 1
with open(path,'w',encoding='utf-8') as f:
    json.dump(data, f, indent=2)
print(f"Updated categories for {count} items")
