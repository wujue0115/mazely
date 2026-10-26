---
description: Crop image colors to the current maze shape or create an image-shaped mask in Mazely Studio.
---

# Studio Image Editor

In [Mazely Studio](https://studio.mazely.dev), select the grid topology and
outer layout, then choose **Upload image**. Use **Edit image** to reopen the
loaded image and adjust the selection.

## Choosing a Mode

For square, triangle, and hexagonal grids, choose a mode in the image editor:

- **Image shape** uses the image silhouette to create a cell mask. Use the
  background-removal and brush tools to refine which cells remain. Triangle
  and hexagonal image-shaped mazes use rectangular outer layouts.
- **Current shape** keeps the selected topology and outer layout, and samples
  image colors across its full grid. It supports triangular and hexagonal outer
  boundaries, rectangular layouts, and both Hex orientations.

Circular grids always use a circular crop. Background removal does not remove
circular cells, including when the source image contains transparency.

## Adjusting the Crop

In Current shape mode or the circular editor:

1. Drag inside the shape to move the selection over the image.
2. Drag a corner handle to resize the selection while preserving its proportions.
3. Scroll to zoom the view, or hold Space and drag to pan. Touch devices support
   pinch zoom.
4. Use the size control to adjust the maze resolution, then apply the selection.

The wall grid remains visible inside the crop. A translucent overlay outside
the shape keeps the rest of the source image visible for positioning. Resetting
the selection fits it to the source image again.

The size control follows the selected topology: triangular and hexagonal outer
layouts use side size, rectangular layouts use the primary grid dimension, and
circular grids use rings. Image uploads default to 60 cells across the primary
image dimension; circular uploads default to **30 rings**, giving a diameter of
**60 cell units**. The center counts as one ring. Studio limits circular grids
to 128 rings.

Applying the crop creates the maze with the selected cell colors. You can then
generate, solve, edit, export, or save it as a `.maze` file.
