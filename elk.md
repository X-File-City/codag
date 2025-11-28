# ELK Layout Migration Plan

## Objective
Evaluate and prototype ELK (Eclipse Layout Kernel) as replacement for Dagre's manual compound layout handling.

## Why ELK
- Native hierarchical/compound node support
- Automatic group bounds calculation (eliminates manual `group.bounds = {...}`)
- Better edge routing for complex graphs
- Actively maintained

## Implementation Steps

### Phase 1: Setup & Spike
1. Install elkjs: `npm install elkjs`
2. Create `frontend/src/layout/elk-layout.ts` alongside existing Dagre code
3. Implement minimal ELK graph builder from current node/edge data

### Phase 2: Layout Configuration
```typescript
const elkOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.layered.spacing.nodeNodeBetweenLayers': 50,
  'elk.spacing.nodeNode': 30
};
```

### Phase 3: Compound Node Mapping
- Map workflow groups to ELK compound nodes
- Child nodes become ELK children with `layoutOptions`
- Edges reference parent/child relationships

### Phase 4: Integration
1. Add feature flag: `useElkLayout` in extension settings
2. Swap layout engine based on flag
3. Keep Dagre as fallback

### Phase 5: Profiling & Comparison
Benchmark on sample graphs:
- Small: 1 workflow, 5-10 nodes
- Medium: 3-5 workflows, 30-50 nodes
- Large: 10+ workflows, 100+ nodes

Metrics to capture:
- Layout computation time
- Memory usage
- Visual quality (edge crossings, spacing)
- Determinism (same input = same output)

## Files to Modify
- `frontend/package.json` - add elkjs dependency
- `frontend/src/webview.ts` - layout engine selection
- `frontend/src/layout/elk-layout.ts` - new file
- `frontend/src/extension.ts` - feature flag config

## Risks
- Bundle size increase (~400KB for elkjs)
- Layout time may be slower for small graphs
- Edge routing style differences from Dagre

## Success Criteria
- Compound layouts work without manual bounds calculation
- No regression in layout quality for existing graphs
- Performance within 2x of Dagre for typical graphs
- Clean fallback path if ELK causes issues
