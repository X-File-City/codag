// Dagre layout and workflow grid tiling
import * as state from './state';
import { snapToGrid, getNodeWorkflowCount, getVirtualNodeId } from './utils';
import { createWorkflowPattern } from './setup';
import { measureNodeDimensions } from './helpers';
import {
    NODE_WIDTH, NODE_HEIGHT,
    DAGRE_NODESEP, DAGRE_RANKSEP, DAGRE_MARGIN,
    WORKFLOW_SPACING,
    GROUP_BOUNDS_PADDING_X, GROUP_BOUNDS_PADDING_TOP, GROUP_BOUNDS_PADDING_BOTTOM,
    COMPONENT_PADDING
} from './constants';
import { WorkflowComponent } from './types';

declare const dagre: any;
declare const d3: any;

/**
 * Find which collapsed component a node belongs to (if any)
 */
function findCollapsedComponent(
    nodeId: string,
    components: WorkflowComponent[],
    expandedComponents: Set<string>
): WorkflowComponent | null {
    for (const comp of components) {
        if (comp.nodes.includes(nodeId) && !expandedComponents.has(comp.id)) {
            return comp;
        }
    }
    return null;
}

// Temporary storage for workflow layout data during two-pass layout
interface WorkflowLayoutData {
    group: any;
    nodes: any[];
    localPositions: Map<string, { x: number; y: number }>;
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
    components: WorkflowComponent[];
    localBoundsMinX: number;
    localBoundsMinY: number;
}

export function layoutWorkflows(defs: any): void {
    const { currentGraphData, workflowGroups, originalPositions, g } = state;
    const expandedComponents = state.getExpandedComponents();

    const layoutData: WorkflowLayoutData[] = [];

    // ========== PASS 1: Layout each workflow individually with dagre ==========
    // All nodes are laid out normally - components don't affect layout
    workflowGroups.forEach((group, idx) => {
        const allGroupNodes = currentGraphData.nodes.filter((n: any) =>
            group.nodes.includes(n.id)
        );

        if (allGroupNodes.length < 3) return;

        const components = group.components || [];

        // Create dagre graph for this workflow
        const dagreGraph = new dagre.graphlib.Graph();
        dagreGraph.setGraph({
            rankdir: 'TB',
            nodesep: DAGRE_NODESEP,
            ranksep: DAGRE_RANKSEP,
            marginx: DAGRE_MARGIN,
            marginy: DAGRE_MARGIN
        });
        dagreGraph.setDefaultEdgeLabel(() => ({}));

        // Add ALL nodes to dagre (components don't change layout)
        allGroupNodes.forEach((node: any) => {
            const dims = measureNodeDimensions(node.label || node.id);
            node.width = dims.width;
            node.height = dims.height;
            dagreGraph.setNode(node.id, { width: dims.width, height: dims.height });
        });

        // Add all edges
        currentGraphData.edges.forEach((edge: any) => {
            if (group.nodes.includes(edge.source) && group.nodes.includes(edge.target)) {
                if (!dagreGraph.hasEdge(edge.source, edge.target)) {
                    dagreGraph.setEdge(edge.source, edge.target);
                }
            }
        });

        dagre.layout(dagreGraph);

        // Store LOCAL positions (no global offset yet)
        const localPositions = new Map<string, { x: number; y: number }>();

        // Store positions for all nodes
        allGroupNodes.forEach((node: any) => {
            const pos = dagreGraph.node(node.id);
            if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
                const isShared = getNodeWorkflowCount(node.id, workflowGroups) > 1;
                const key = isShared ? getVirtualNodeId(node.id, group.id) : node.id;
                localPositions.set(key, { x: snapToGrid(pos.x), y: snapToGrid(pos.y) });
            }
        });

        // Calculate local bounds using actual node edges
        const positionEntries = Array.from(localPositions.entries());
        if (positionEntries.length === 0) return;

        // Build array with position + dimensions for each node
        const nodesWithBounds = positionEntries.map(([key, pos]) => {
            // Find node to get its dynamic dimensions
            const nodeId = key.includes('__') ? key.split('__')[0] : key;
            const node = allGroupNodes.find((n: any) => n.id === nodeId);
            const width = node?.width || NODE_WIDTH;
            const height = node?.height || NODE_HEIGHT;
            return { x: pos.x, y: pos.y, width, height };
        });

        // Calculate bounds using actual node edges (tight fit)
        const localBounds = {
            minX: Math.min(...nodesWithBounds.map(n => n.x - n.width / 2)) - GROUP_BOUNDS_PADDING_X,
            maxX: Math.max(...nodesWithBounds.map(n => n.x + n.width / 2)) + GROUP_BOUNDS_PADDING_X,
            minY: Math.min(...nodesWithBounds.map(n => n.y - n.height / 2)) - GROUP_BOUNDS_PADDING_TOP,
            maxY: Math.max(...nodesWithBounds.map(n => n.y + n.height / 2)) + GROUP_BOUNDS_PADDING_BOTTOM
        };

        const width = localBounds.maxX - localBounds.minX;
        const height = localBounds.maxY - localBounds.minY;

        layoutData.push({
            group,
            nodes: allGroupNodes,
            localPositions,
            width,
            height,
            offsetX: 0,
            offsetY: 0,
            components,
            localBoundsMinX: localBounds.minX,
            localBoundsMinY: localBounds.minY
        });
    });

    // ========== PASS 2: Radial corner-packing layout ==========
    if (layoutData.length > 0) {
        const S = WORKFLOW_SPACING;

        // Sort by area descending (largest first)
        const sortedData = [...layoutData].sort((a, b) => (b.width * b.height) - (a.width * a.height));

        console.log('[layout] PASS 2: Radial corner-packing');
        console.log('[layout] Sorted workflows by area:', sortedData.map(d => ({ name: d.group.name, w: d.width, h: d.height, area: d.width * d.height })));

        // Placed workflows: { x, y, w, h } where x,y is top-left corner
        const placed: { x: number; y: number; w: number; h: number; name: string }[] = [];

        // Check if position overlaps any placed workflow (need S gap from all)
        const overlaps = (x: number, y: number, w: number, h: number): boolean => {
            for (const p of placed) {
                const noOverlap =
                    x + w + S <= p.x ||
                    p.x + p.w + S <= x ||
                    y + h + S <= p.y ||
                    p.y + p.h + S <= y;
                if (!noOverlap) return true;
            }
            return false;
        };

        // Distance from position center to origin
        const distToCenter = (x: number, y: number, w: number, h: number): number => {
            const cx = x + w / 2;
            const cy = y + h / 2;
            return Math.sqrt(cx * cx + cy * cy);
        };

        // Find corners: positions where new workflow is S away from TWO edges
        // (one horizontal edge of workflow A, one vertical edge of workflow B)
        const getCorners = (w: number, h: number): { x: number; y: number }[] => {
            const corners: { x: number; y: number }[] = [];

            for (const a of placed) {
                for (const b of placed) {
                    // Corner types: new workflow touches a's horizontal edge + b's vertical edge

                    // Below a's bottom + right of b's right
                    corners.push({ x: b.x + b.w + S, y: a.y + a.h + S });
                    // Below a's bottom + left of b's left
                    corners.push({ x: b.x - w - S, y: a.y + a.h + S });
                    // Above a's top + right of b's right
                    corners.push({ x: b.x + b.w + S, y: a.y - h - S });
                    // Above a's top + left of b's left
                    corners.push({ x: b.x - w - S, y: a.y - h - S });
                }
            }

            return corners;
        };

        // Place each workflow
        sortedData.forEach((data, idx) => {
            const w = data.width;
            const h = data.height;

            if (idx === 0) {
                // Largest at center
                data.offsetX = 0;
                data.offsetY = 0;
                placed.push({ x: 0, y: 0, w, h, name: data.group.name });
                console.log(`[layout] Placed #0 "${data.group.name}" at (0, 0), size ${w}x${h}`);
                return;
            }

            if (idx === 1) {
                // Second to the RIGHT of first, top-aligned
                const first = placed[0];
                data.offsetX = first.x + first.w + S;
                data.offsetY = first.y; // top-aligned
                placed.push({ x: data.offsetX, y: data.offsetY, w, h, name: data.group.name });
                console.log(`[layout] Placed #1 "${data.group.name}" at (${data.offsetX}, ${data.offsetY}), size ${w}x${h}`);
                console.log(`[layout]   - first.x=${first.x}, first.w=${first.w}, S=${S}, first.y=${first.y}`);
                return;
            }

            // Find all corners
            const corners = getCorners(w, h);
            console.log(`[layout] Finding position for #${idx} "${data.group.name}", size ${w}x${h}`);
            console.log(`[layout]   - ${corners.length} corner candidates`);

            // Find valid corner closest to center
            let bestPos: { x: number; y: number } | null = null;
            let bestDist = Infinity;

            const validCorners: { x: number; y: number; dist: number }[] = [];
            for (const pos of corners) {
                if (!overlaps(pos.x, pos.y, w, h)) {
                    const dist = distToCenter(pos.x, pos.y, w, h);
                    validCorners.push({ ...pos, dist });
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestPos = pos;
                    }
                }
            }

            console.log(`[layout]   - ${validCorners.length} valid corners:`, validCorners.slice(0, 5));

            if (bestPos) {
                data.offsetX = bestPos.x;
                data.offsetY = bestPos.y;
                console.log(`[layout] Placed #${idx} "${data.group.name}" at (${bestPos.x}, ${bestPos.y}), dist=${bestDist.toFixed(1)}`);
            } else {
                // Fallback: place to the right of everything
                const maxRight = Math.max(...placed.map(p => p.x + p.w));
                data.offsetX = maxRight + S;
                data.offsetY = 0;
                console.log(`[layout] Placed #${idx} "${data.group.name}" at FALLBACK (${data.offsetX}, 0)`);
            }

            placed.push({ x: data.offsetX, y: data.offsetY, w, h, name: data.group.name });
        });

        console.log('[layout] Final placed array:', placed);

        // Normalize: shift so min is at (0, 0)
        const minX = Math.min(...sortedData.map(d => d.offsetX));
        const minY = Math.min(...sortedData.map(d => d.offsetY));
        console.log(`[layout] Normalizing: minX=${minX}, minY=${minY}`);
        sortedData.forEach((data) => {
            data.offsetX -= minX;
            data.offsetY -= minY;
        });

        console.log('[layout] After normalization:', sortedData.map(d => ({ name: d.group.name, offsetX: d.offsetX, offsetY: d.offsetY })));
    }

    // ========== PASS 3: Apply global offsets and finalize positions ==========
    layoutData.forEach((data) => {
        const { group, nodes, localPositions, offsetX, offsetY, components, localBoundsMinX, localBoundsMinY } = data;

        console.log(`[layout] PASS 3: "${group.name}" - offsetX=${offsetX.toFixed(1)}, offsetY=${offsetY.toFixed(1)}, localBoundsMin=(${localBoundsMinX.toFixed(1)}, ${localBoundsMinY.toFixed(1)}), PASS1 size=(${data.width.toFixed(1)}, ${data.height.toFixed(1)})`);

        // Apply offset to ALL node positions
        // Normalize by subtracting localBounds origin so positions start at (0,0)
        nodes.forEach((node: any) => {
            const isShared = getNodeWorkflowCount(node.id, workflowGroups) > 1;
            const key = isShared ? getVirtualNodeId(node.id, group.id) : node.id;
            const localPos = localPositions.get(key);

            if (localPos) {
                const x = localPos.x - localBoundsMinX + offsetX;
                const y = localPos.y - localBoundsMinY + offsetY;

                if (isShared) {
                    originalPositions.set(key, { x, y });
                } else {
                    node.x = x;
                    node.y = y;
                    node.fx = x;
                    node.fy = y;
                    originalPositions.set(node.id, { x, y });
                }
            }
        });

        // Calculate component bounds from their actual node positions
        components.forEach((comp: WorkflowComponent) => {
            const compNodes = nodes.filter((n: any) => comp.nodes.includes(n.id));
            if (compNodes.length === 0) return;

            // Get positions for component nodes
            const nodePositions = compNodes.map((node: any) => {
                const isShared = getNodeWorkflowCount(node.id, workflowGroups) > 1;
                if (isShared) {
                    const virtualId = getVirtualNodeId(node.id, group.id);
                    const pos = originalPositions.get(virtualId);
                    return pos ? { x: pos.x, y: pos.y, w: node.width || NODE_WIDTH, h: node.height || NODE_HEIGHT } : null;
                } else {
                    return { x: node.x, y: node.y, w: node.width || NODE_WIDTH, h: node.height || NODE_HEIGHT };
                }
            }).filter((p: any) => p !== null);

            if (nodePositions.length === 0) return;

            // Calculate bounds from node positions (with padding)
            comp.bounds = {
                minX: Math.min(...nodePositions.map((p: any) => p.x - p.w / 2)) - COMPONENT_PADDING,
                maxX: Math.max(...nodePositions.map((p: any) => p.x + p.w / 2)) + COMPONENT_PADDING,
                minY: Math.min(...nodePositions.map((p: any) => p.y - p.h / 2)) - COMPONENT_PADDING,
                maxY: Math.max(...nodePositions.map((p: any) => p.y + p.h / 2)) + COMPONENT_PADDING
            };
            comp.centerX = (comp.bounds.minX + comp.bounds.maxX) / 2;
            comp.centerY = (comp.bounds.minY + comp.bounds.maxY) / 2;
        });

        // Use the exact bounds we calculated in PASS 1 and positioned in PASS 2
        // No recalculation - just apply the offset to get final bounds
        group.bounds = {
            minX: offsetX,
            maxX: offsetX + data.width,
            minY: offsetY,
            maxY: offsetY + data.height
        };
        group.centerX = (group.bounds.minX + group.bounds.maxX) / 2;
        group.centerY = (group.bounds.minY + group.bounds.maxY) / 2;

        console.log(`[layout] PASS 3: "${group.name}" bounds: (${offsetX}, ${offsetY}) -> (${offsetX + data.width}, ${offsetY + data.height})`);
    });

    // Create colored dot patterns for each workflow group
    workflowGroups.forEach((group) => {
        createWorkflowPattern(defs, group.id, group.color);
    });

    state.setOriginalPositions(originalPositions);

    // Build a map of which nodes are in collapsed components
    const nodesInCollapsedComponents = new Set<string>();
    workflowGroups.forEach((group: any) => {
        (group.components || []).forEach((comp: WorkflowComponent) => {
            if (!expandedComponents.has(comp.id)) {
                comp.nodes.forEach((nodeId: string) => nodesInCollapsedComponents.add(nodeId));
            }
        });
    });

    // Create expanded nodes (shared nodes become virtual copies per workflow)
    // This must happen BEFORE renderEdges() so edges can find node positions
    const expandedNodesList: any[] = [];
    const sharedNodeCopies = new Map<string, string[]>();

    currentGraphData.nodes.forEach((node: any) => {
        // Skip nodes in collapsed components
        if (nodesInCollapsedComponents.has(node.id)) {
            return;
        }

        const nodeWorkflows = workflowGroups.filter((g: any) =>
            g.nodes.includes(node.id) && g.nodes.length >= 3
        );

        if (nodeWorkflows.length > 1) {
            // Shared node: create a copy for each workflow
            nodeWorkflows.forEach((wf: any) => {
                const virtualId = getVirtualNodeId(node.id, wf.id);
                const pos = originalPositions.get(virtualId) || { x: 0, y: 0 };
                expandedNodesList.push({
                    ...node,
                    id: virtualId,
                    _originalId: node.id,
                    _workflowId: wf.id,
                    x: pos.x,
                    y: pos.y,
                    fx: pos.x,
                    fy: pos.y
                });
                if (!sharedNodeCopies.has(node.id)) {
                    sharedNodeCopies.set(node.id, []);
                }
                sharedNodeCopies.get(node.id)!.push(virtualId);
            });
        } else if (nodeWorkflows.length === 1) {
            // Non-shared node: use original (position already set on node object)
            expandedNodesList.push(node);
        }
        // Nodes in no valid workflow (< 3 nodes) are skipped
    });

    state.setExpandedNodes(expandedNodesList);
    state.setSharedNodeCopies(sharedNodeCopies);
}
