# Placeholder for app icon
# Replace this with your actual icon files:
# - icon.png (256x256 for general use)
# - icon.ico (Windows icon, multiple sizes)

This folder should contain:
1. icon.png - PNG icon for the application
2. icon.ico - Windows ICO file (required for building)

To create an ICO file:
1. Create a 256x256 PNG icon
2. Use an online converter or tool like ImageMagick:
   magick convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
