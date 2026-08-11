import os
from PIL import Image, ImageDraw, ImageFont
import math

admin_folder = r"D:\Đồ-án-cơ-sở-01\homex-pos\Nguyễn Đức Thịnh_2305CT2084_CT07PM\1_UI website\Admin"
output_folder = r"C:\Users\Windows\.gemini\antigravity-ide\brain\b7d6b310-328a-4994-8cea-6a19bd30bfd6\scratch"

images = sorted([f for f in os.listdir(admin_folder) if f.lower().endswith('.jpg')])

grid_cols = 4
grid_rows = 4
images_per_grid = grid_cols * grid_rows
thumb_width = 600
thumb_height = 400

for i in range(0, len(images), images_per_grid):
    batch = images[i:i+images_per_grid]
    
    grid_img = Image.new('RGB', (grid_cols * thumb_width, grid_rows * thumb_height), color='white')
    draw = ImageDraw.Draw(grid_img)
    
    for j, img_name in enumerate(batch):
        img_path = os.path.join(admin_folder, img_name)
        img = Image.open(img_path)
        img.thumbnail((thumb_width, thumb_height))
        
        # Calculate position
        row = j // grid_cols
        col = j % grid_cols
        x = col * thumb_width
        y = row * thumb_height
        
        # Paste image
        grid_img.paste(img, (x, y))
        
        # Draw text (draw a rectangle behind text for visibility)
        text = img_name
        # Simple text drawing
        draw.rectangle([x, y, x + thumb_width, y + 20], fill="black")
        draw.text((x + 5, y + 5), text, fill="white")
        
    out_path = os.path.join(output_folder, f"admin_grid_{i//images_per_grid + 1}.jpg")
    grid_img.save(out_path)
    print(f"Saved {out_path}")
