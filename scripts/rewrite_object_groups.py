new_content = {
  "object_groups": [
    {
      "id": "bathroom",
      "description": "Bathroom category containing fixtures and accessories",
      "items": [
        "Bath",
        "Shower",
        "Sink",
        "Toilet Roll Holder",
        "Toilet Rolls",
        "Toilet",
        "Towel Holder"
      ],
      "placement_rules": {
        "keep_neat": True,
        "min_clearance": 0.3,
        "adjacent_pairs": [
          ["Sink", "Toilet"],
          ["Sink", "Towel Holder"]
        ],
        "wall_attachment": [
          "Towel Holder",
          "Toilet Roll Holder"
        ]
      }
    },
    {
      "id": "kitchen",
      "description": "Kitchen appliances and cabinetry – only one of each major appliance",
      "items": [
        "Blender",
        "Cupboard A",
        "Cupboard B",
        "Cupboard C",
        "Cupboard D",
        "Cupboard E",
        "Cupboard F",
        "Cupboard Sink",
        "Dishwasher",
        "Fridge A",
        "Fridge B",
        "Kettle",
        "Kitchen Roll",
        "Knife Block",
        "Microwave",
        "Oven",
        "Toaster",
        "Washing Machine"
      ],
      "placement_rules": {
        "single_instance": ["Oven", "Dishwasher"],
        "one_of_each_appliance": [
          "Blender",
          "Kettle",
          "Microwave",
          "Toaster",
          "Washing Machine"
        ],
        "appliances_on_counter": True,
        "stove_adjacent_to_dishwasher": True,
        "min_spacing": 0.4
      }
    },
    {
      "id": "living_room",
      "description": "All living room furniture and decor",
      "items": [
        "Carpet A",
        "Carpet B",
        "Carpet C",
        "Chair A",
        "Chair B",
        "Chair C",
        "Chair D",
        "Chair E",
        "Door A",
        "Door B",
        "Door C",
        "Ceiling Light",
        "Lamp A",
        "Lamp B",
        "Lamp C",
        "Wall Light",
        "Alarm Clock",
        "Bin",
        "Books A",
        "Books B",
        "Bowl",
        "Broom",
        "Ceiling Fan",
        "Clock",
        "Curtains",
        "Fan",
        "Glass",
        "Globe",
        "Hoover",
        "Ladder",
        "Light Switch",
        "Mirror A",
        "Mirror B",
        "Mug",
        "Pan",
        "Plant A",
        "Plant B",
        "Plate",
        "Pot",
        "Radiator A",
        "Radiator B",
        "Safe A",
        "Safe B",
        "Socket",
        "Speaker",
        "Vase",
        "Vent",
        "Shelf A",
        "Shelf B",
        "Shelf C",
        "Shelf D",
        "Shelf E",
        "Wall Shelf A",
        "Wall Shelf B",
        "Sofa A",
        "Sofa B",
        "Sofa C",
        "Sofa D",
        "Desk",
        "Rounded Table A",
        "Rounded Table B",
        "Rounded Table C",
        "Table A",
        "Table B",
        "Table C",
        "Table D",
        "Window A",
        "Window B",
        "Window C"
      ],
      "placement_rules": {
        "must_have_seating": True,
        "must_have_rug": True,
        "seating_face_tv": True,
        "centered_on": "Carpet"
      }
    },
    {
      "id": "bedroom",
      "description": "Bedroom furniture to create a cozy, unclipped layout",
      "items": [
        "Bed Double",
        "Bed Single",
        "Bunk Bed",
        "Triple Bunk Bed",
        "Drawer A",
        "Drawer B"
      ],
      "placement_rules": {
        "cozy": True,
        "no_clipping": True,
        "require_wall_for_bed": True,
        "min_clearance": 0.4
      }
    },
    {
      "id": "office",
      "description": "Office equipment and workspace guidelines",
      "items": [
        "Console A",
        "Console B",
        "Console C",
        "Console D",
        "Keyboard",
        "Laptop",
        "Monitor",
        "Pc",
        "Phone",
        "Tablet",
        "TV A",
        "TV B",
        "Desk"
      ],
      "placement_rules": {
        "keep_neat": True,
        "chairs_with_desk": True,
        "no_random_floor_objects": True
      }
    }
  ]
}

import json
with open(r"c:\Users\appls\OneDrive\Desktop\Irvine_Hacks_2026\models\object_groups.json", "w", encoding="utf-8") as f:
    json.dump(new_content, f, indent=2)
print("Updated object_groups.json")
