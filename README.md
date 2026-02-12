# Mosaic Mashup

## Overview
**Mosaic Mashup** is a mobile web puzzle game where players connect adjacent tiles of the same color to reconstruct hidden mosaic artwork. Built in 24 hours at **TartanHacks 2026** (Carnegie Mellon University), the game was developed under a strict **15kb size constraint** with **zero external libraries**, using only TypeScript, HTML, and CSS.

The game features **custom WebGL2 shaders** that render dynamic Voronoi diagrams, creating fluid mosaic patterns that morph in real-time as tiles move. Players collect tiles by color until they've gathered enough to reveal the complete mosaic artwork through an animated reconstruction sequence.

Co-developed with [Henry Abrahamsen](https://github.com/hen1227).

---

## 🎮 Play Now

> **TODO: Add live demo link here once hosted**  
> `https://your-game-url.com`

---

## Key Features
- **15kb total size** — Entire game fits in under 15 kilobytes with no external dependencies
- **Custom GPU shaders** — Real-time Voronoi diagram rendering with dynamic morphing effects
- **Zero libraries** — All algorithms implemented from scratch in TypeScript
- **Mobile-optimized** — Touch controls and performance tuned for mobile browsers
- **Multiple levels** — Three unique mosaic artworks with varying difficulty
- **Level editor companion tool** — Visual editor for creating custom levels
- **Instant level loading** — Levels encoded as compact strings for immediate reconstruction

---

## Screenshots

<table>
  <tr>
    <td align="center">
      <img src="path/to/screenshot1.png" width="350" />
      <br />
      <em>Gameplay: Collecting tiles</em>
    </td>
    <td align="center">
      <img src="path/to/screenshot2.png" width="350" />
      <br />
      <em>Tile selection and chaining</em>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="path/to/screenshot3.png" width="350" />
      <br />
      <em>Mosaic reveal animation</em>
    </td>
    <td align="center">
      <img src="path/to/screenshot4.png" width="350" />
      <br />
      <em>Completed mosaic artwork</em>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="path/to/screenshot5.png" width="350" />
      <br />
      <em>Level editor interface</em>
    </td>
    <td align="center">
      <img src="path/to/screenshot6.png" width="350" />
      <br />
      <em>Custom mosaic creation</em>
    </td>
  </tr>
</table>

---

## How to Play

### Objective
Collect enough tiles of each color to reconstruct the hidden mosaic artwork.

### Gameplay
1. **Swipe to connect** — Drag across adjacent tiles of the same color to create chains
2. **Release to collect** — Let go to collect the connected tiles
3. **Watch requirements** — The bottom of the screen shows how many tiles of each color you still need
4. **New tiles spawn** — Fresh tiles appear from above to keep the board full
5. **Complete the mosaic** — Once you've collected enough tiles, reconstruct the final artwork by tapping color piles

### Game Flow
- Start by selecting a level from the home screen
- Connect and collect tiles by swiping across matching colors
- Tiles must be **adjacent** (sharing a Voronoi cell boundary) to connect
- Each level requires specific quantities of each color to complete
- After collecting all required tiles, tap the colored piles at the bottom to animate them into the final mosaic
- Once complete, return to the home screen to select another level

---

## Architecture Highlights

### Dual Voronoi System

The game implements Voronoi diagrams in two parallel systems, each optimized for its specific purpose:

**GPU System (Rendering)**
- Custom WebGL2 fragment shaders compute per-pixel Voronoi regions in real-time
- Each pixel calculates its distance to all tile centers to determine which region it belongs to
- Distance to the nearest perpendicular bisector edge is computed for rendering gaps between tiles
- Shader-based lighting effects create beveled "pillow" appearance with dynamic highlights
- Anti-aliasing smooths tile boundaries for clean visual presentation

**CPU System (Game Logic)**
- Tile adjacency detection uses computational geometry algorithms
- For each pair of tiles, the perpendicular bisector line is computed
- Half-plane intersection tests determine if tiles share a Voronoi edge
- Only tiles that are Voronoi neighbors can be connected in gameplay
- This ensures visual consistency: tiles that appear adjacent in the rendering are logically adjacent in the game

This dual approach allows complex visual effects on the GPU while maintaining precise game logic on the CPU.

### 15kb Constraint Strategy

To achieve the 15kb size limit, the codebase employs aggressive optimization techniques:

**Zero External Libraries**
- No frameworks, no dependencies — all functionality built from scratch
- Custom WebGL shader pipeline replaces graphics libraries
- Hand-rolled physics engine for tile movement
- Minimal abstraction layers to reduce code size

**Code Minimization**
- Concise variable names (`i`, `j`, `t`, `el`) throughout
- No TypeScript type annotations in compiled output
- Shared utility functions to avoid duplication
- Inline calculations where possible

**Asset Strategy**
- No image files — all visuals generated procedurally via shaders
- Colors defined as compact hex values in a palette array
- Levels encoded as strings rather than JSON files

**Deferred Features**
- Level editor excluded from the 15kb build
- Hosted separately to avoid size constraints
- Editor generates the same minified strings the game consumes

### Level Encoding System

Levels are stored as **minified strings** containing all necessary data to reconstruct a playable level:

**Encoding Format**
```
[level_name]|[color_mappings]|[tile_data]
```

**Components**
- **Level name**: String identifier (e.g., "Scotty Dog")
- **Color mappings**: Hexadecimal color values mapped to integer IDs
- **Tile data**: Comma-separated list of `(colorID, posX, posY)` tuples

**Benefits**
- Levels can be shared as simple text strings
- Instant loading with no parsing overhead
- Enables copy-paste level sharing between users
- Editor export/import uses the same format

**Example Flow**
1. Developer creates mosaic in the level editor
2. Editor exports a string like: `Smiley|#FFD700:0,#FF6B6B:1|0,120,80,1,200,90,...`
3. Game deserializes string to reconstruct Voronoi points
4. Voronoi diagram renders the mosaic instantly

### Game State Management

The architecture separates concerns using a component-based model structure:

**Core Components**
- `GameLevel`: Manages tile collection, win conditions, and refill logic
- `Tile`: Data structure holding position, velocity, size, and color
- `TileGenerator`: Centralized spawning system ensuring consistent tile distribution

**Physics Engine**
- Tiles are modeled as **circles** for efficient collision detection
- Simple velocity-based movement with boundary constraints
- Circular collision models map directly to Voronoi seed points
- GPU renders Voronoi regions while CPU handles circle physics

**Selection System**
- Tracks selected tiles during swipe gestures
- Validates adjacency using Voronoi edge detection
- Highlights valid chains in real-time
- Finalizes collection and triggers tile removal/spawning

**Animation System**
- Staggered timing for tile collection effects
- Sprite extraction from WebGL framebuffer for flying animations
- HTML canvas overlays for UI effects outside the WebGL viewport
- Easing functions for smooth, polished motion

---

## Level Editor

The companion **Level Editor** is a separate web application that enables developers to create custom mosaic artwork without coding.

### Features
- **Visual design interface** — Click on a background image to place Voronoi seed points
- **Color sampling** — Placed points automatically inherit the color from the underlying pixel
- **Live preview** — See the Voronoi diagram render in real-time as you design
- **Point manipulation** — Drag points to adjust mosaic structure
- **Export system** — Generate minified strings for use in the game
- **Import system** — Load existing levels from strings for editing

### Workflow
1. Upload a reference image (e.g., Scotty the Dog mascot, smiley face, fruit bowl)
2. Click on the image to place colored Voronoi points
3. Adjust point positions by dragging to refine the mosaic appearance
4. Export the design as a compact string
5. Paste the string into the game's level encoding array

The editor is excluded from the 15kb game build and hosted separately, allowing for richer features without size constraints.

---

## Technical Stack

- **TypeScript** — Core game logic and type safety
- **WebGL2** — GPU-accelerated Voronoi rendering
- **HTML5 Canvas** — UI overlays and animation layers
- **CSS** — Styling and layout

---

## Development Context

This project was developed in **24 hours** at **TartanHacks 2026** (Carnegie Mellon University) under the 15kb size constraint category. The challenge required building a fully functional game without any external libraries, pushing the boundaries of what's possible with vanilla web technologies.

Co-developed with [Henry Ashton Howe](https://github.com/hen1227).

---

## Status
Active — maintained as a portfolio project and technical showcase.
