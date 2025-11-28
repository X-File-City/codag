# Node Redesign Plan

## Overview
Flip the node layout: dark header on top (icon + label, left-aligned), colored body below (centered title).

## New Dimensions
- **Width:** 140px (unchanged)
- **Height:** 122px (was 70px) — 8:7 width:height ratio
- **Header:** 30px tall (dark background)
- **Body:** 92px tall (colored background with type color at 50% opacity)

## Visual Layout
```
┌──────────────────────────────┐
│ [icon] LLM                   │  ← 30px, dark bg (vscode-editor-background)
├──────────────────────────────┤     icon + type label left-aligned
│                              │
│         Node Title           │  ← 92px, colored bg (type color @ 50% opacity)
│                              │     title centered horizontally & vertically
└──────────────────────────────┘
```

## Coordinate System (centered at origin)
- Node center: (0, 0)
- Half width: 70px, Half height: 61px
- Top edge: y = -61
- Bottom edge: y = +61
- Left edge: x = -70
- Right edge: x = +70
- Header/body boundary: y = -31 (30px from top)

## SVG Path Calculations

### Header Path (dark, rounded top corners)
```
M -66,-61      Start at top-left (inset 4px for corner)
L 66,-61       Line to top-right
A 4,4 0 0,1 70,-57   Arc to right edge (4px radius)
L 70,-31       Line down to header bottom
L -70,-31      Line to left side
L -70,-57      Line up to before left corner
A 4,4 0 0,1 -66,-61  Arc back to start
Z
```
**Final:** `M -66,-61 L 66,-61 A 4,4 0 0,1 70,-57 L 70,-31 L -70,-31 L -70,-57 A 4,4 0 0,1 -66,-61 Z`

### Body Path (colored, rounded bottom corners)
```
M -70,-31      Start at header bottom left
L 70,-31       Line to right
L 70,57        Line down to before bottom corner
A 4,4 0 0,1 66,61    Arc to bottom edge
L -66,61       Line to left side bottom
A 4,4 0 0,1 -70,57   Arc to left edge
Z
```
**Final:** `M -70,-31 L 70,-31 L 70,57 A 4,4 0 0,1 66,61 L -66,61 A 4,4 0 0,1 -70,57 Z`

## Element Positions

### Icon (top-left of header)
- Transform: `translate(-62, -46) scale(0.8)`
- Calculation: x = -70 + 8 = -62, y = -61 + 15 = -46

### Type Label (next to icon in header)
- Position: x = -38, y = -46
- Calculation: x = -70 + 32 = -38, y = -61 + 15 = -46
- Text anchor: start (left-aligned)

### Title (centered in body)
- Position: y = 15
- Calculation: y = -61 + 30 + (122-30)/2 = -61 + 30 + 46 = 15
- Text anchor: middle (centered)

### Border Rect
- Width: 140, Height: 122
- Position: x = -70, y = -61

### Selection Indicator (camera corners)
- cornerOffsetX: 78
- cornerOffsetY: 69 (61 + 8)

## Files to Modify

### 1. `frontend/src/webview.ts`

#### A. Dagre Layout (4 locations)
Change node height in `setNode()` calls:
```typescript
// Line ~398, ~2079, ~2128, ~2161
dagreGraph.setNode(node.id, { width: 140, height: 122 });
```

#### B. Main Node Rendering (~lines 782-900)
Replace the current node structure:

**Current structure:**
1. Background rect (dark fill)
2. Header path (colored, top 24px)
3. Border rect
4. Title text (in header)
5. Icon (bottom-right)
6. Type label (bottom-right)
7. Selection indicator

**New structure:**
1. Header path (dark fill, top 30px, rounded top corners)
2. Body path (colored fill @ 50%, bottom 92px, rounded bottom corners)
3. Border rect (stroke only, 140x122)
4. Icon (top-left header)
5. Type label (next to icon, left-aligned)
6. Title text (centered in body)
7. Selection indicator (updated dimensions)

#### C. `renderNode()` Function (~lines 2337-2429)
Apply same changes as main rendering for incremental node creation.

#### D. Viewport Bounds Calculation (~lines 1429-1436, 1480-1487)
Update nodeHeight from 70 to 122:
```typescript
const nodeHeight = 122;
```

### 2. `frontend/src/webview/styles.ts`
No major changes needed - positioning is handled via inline SVG attributes.

## Type Colors Reference
```typescript
const typeColors = {
    'trigger': '#FFB74D',
    'llm': '#64B5F6',
    'tool': '#81C784',
    'decision': '#BA68C8',
    'integration': '#FF8A65',
    'memory': '#4DB6AC',
    'parser': '#A1887F',
    'output': '#90A4AE'
};
```

## Important Notes

1. **Template Literals Issue:** The webview.ts code runs inside a string that's sent to the webview. Using template literals with `${}` for dynamic path generation causes TypeScript parsing errors. Use hardcoded path strings instead.

2. **Dagre Integration:** The layout algorithm automatically spaces nodes based on the dimensions passed to `g.setNode()`. Changing height to 122px will automatically increase vertical spacing.

3. **Entry/Exit/Critical Path Styling:** The border rect classes (entry-point, exit-point, critical-path) should continue to work unchanged since they target the border rect element.

4. **Hover States:** The CSS hover styles target `.node rect` which will continue to work with the new structure.
