import json
import os
import shutil

admin_folder = r"D:\Đồ-án-cơ-sở-01\homex-pos\Nguyễn Đức Thịnh_2305CT2084_CT07PM\1_UI website\Admin"
tools_dir = r"D:\Đồ-án-cơ-sở-01\homex-pos\tools"

master_map = {}
for i in range(1, 5):
    map_file = os.path.join(tools_dir, f"manual_map_{i}.json")
    if os.path.exists(map_file):
        with open(map_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            master_map.update(data)

# Temporary rename pass
temp_map = {}
for old_name, new_name in master_map.items():
    if old_name != new_name:
        old_path = os.path.join(admin_folder, old_name)
        if os.path.exists(old_path):
            temp_name = "TEMP_" + new_name
            temp_path = os.path.join(admin_folder, temp_name)
            os.rename(old_path, temp_path)
            temp_map[temp_name] = new_name

# Final rename pass
for temp_name, new_name in temp_map.items():
    temp_path = os.path.join(admin_folder, temp_name)
    new_path = os.path.join(admin_folder, new_name)
    os.rename(temp_path, new_path)
    print(f"Renamed {temp_name.replace('TEMP_', '')} to {new_name}")

print("Manual mapping applied successfully.")
