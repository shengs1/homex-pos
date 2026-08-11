import os
from PIL import Image, ImageDraw, ImageFont
import math

cashier_folder = r"D:\Đồ-án-cơ-sở-01\homex-pos\Nguyễn Đức Thịnh_2305CT2084_CT07PM\1_UI website\Cashier"
output_folder = r"C:\Users\Windows\.gemini\antigravity-ide\brain\b7d6b310-328a-4994-8cea-6a19bd30bfd6\scratch"

images = sorted([f for f in os.listdir(cashier_folder) if f.lower().endswith('.jpg')])

grid_cols = 3
grid_rows = 2
images_per_grid = grid_cols * grid_rows
thumb_width = 600
thumb_height = 400

grid_img = Image.new('RGB', (grid_cols * thumb_width, grid_rows * thumb_height), color='white')
draw = ImageDraw.Draw(grid_img)

for j, img_name in enumerate(images):
    img_path = os.path.join(cashier_folder, img_name)
    img = Image.open(img_path)
    img.thumbnail((thumb_width, thumb_height))
    
    row = j // grid_cols
    col = j % grid_cols
    x = col * thumb_width
    y = row * thumb_height
    
    grid_img.paste(img, (x, y))
    
    text = img_name
    draw.rectangle([x, y, x + thumb_width, y + 20], fill="black")
    draw.text((x + 5, y + 5), text, fill="white")
    
out_path = os.path.join(output_folder, f"cashier_grid_1.jpg")
grid_img.save(out_path)
print(f"Saved {out_path}")
