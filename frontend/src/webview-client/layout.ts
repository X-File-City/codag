// Dagre layout and workflow stacking
import * as state from './state';
import { snapToGrid, getNodeWorkflowCount, getVirtualNodeId } from './utils';
import { createWorkflowPattern } from './setup';
import { calculateGroupBounds } from './helpers';
import { measureTextWidth } from './groups';
import {
    NODE_WIDTH, NODE_HEIGHT,
    DAGRE_NODESEP, DAGRE_RANKSEP, DAGRE_MARGIN,
    WORKFLOW_SPACING,
    GROUP_TITLE_OFFSET_X
} from './constants';

declare const dagre: any;
declare const d3: any;

export function layoutWorkflows(defs: any): void {
    const { currentGraphData, workflowGroups, originalPositions, g } = state;

    let currentYOffset = 0;

    workflowGroups.forEach((group, idx) => {

        // Get ALL nodes in this workflow (including shared nodes)
        const allGroupNodes = currentGraphData.nodes.filter((n: any) =>
            group.nodes.includes(n.id)
        );

        // Skip groups with less than 3 nodes total
        if (allGroupNodes.length < 3) return;

        // Create separate Dagre graph for this workflow
        const dagreGraph = new dagre.graphlib.Graph();
        dagreGraph.setGraph({
            rankdir: 'LR',
            nodesep: DAGRE_NODESEP,
            ranksep: DAGRE_RANKSEP,
            marginx: DAGRE_MARGIN,
            marginy: DAGRE_MARGIN
        });
        dagreGraph.setDefaultEdgeLabel(() => ({}));

        // Add ALL nodes to Dagre
        allGroupNodes.forEach((node: any) => {
            dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
        });

        // Add only edges between nodes in this workflow
        currentGraphData.edges.forEach((edge: any) => {
            if (group.nodes.includes(edge.source) && group.nodes.includes(edge.target)) {
                dagreGraph.setEdge(edge.source, edge.target);
            }
        });

        // Layout this workflow
        dagre.layout(dagreGraph);

        // Apply positions to ALL nodes with Y offset
        allGroupNodes.forEach((node: any) => {
            const pos = dagreGraph.node(node.id);
            const isShared = getNodeWorkflowCount(node.id, workflowGroups) > 1;
            let x: number, y: number;

            if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number' ||
                isNaN(pos.x) || isNaN(pos.y)) {
                console.warn(`Invalid position for node ${node.id} (${node.label}), using fallback`);
                x = 0;
                y = currentYOffset;
            } else {
                x = snapToGrid(pos.x);
                y = snapToGrid(pos.y + currentYOffset);
            }

            // For shared nodes, store position under virtual ID (so each workflow copy has its own position)
            // For non-shared nodes, store under original ID and also update node object
            if (isShared) {
                const virtualId = getVirtualNodeId(node.id, group.id);
                originalPositions.set(virtualId, { x, y });
            } else {
                node.x = x;
                node.y = y;
                node.fx = x;
                node.fy = y;
                originalPositions.set(node.id, { x, y });
            }
        });

        // Calculate bounds from ALL nodes (shared nodes now have virtual copies with positions)
        // Create nodes with positions for bounds calculation
        const nodesWithPositions = allGroupNodes.map((node: any) => {
            const isShared = getNodeWorkflowCount(node.id, workflowGroups) > 1;
            if (isShared) {
                const virtualId = getVirtualNodeId(node.id, group.id);
                const pos = originalPositions.get(virtualId);
                return pos ? { ...node, x: pos.x, y: pos.y } : null;
            } else {
                return node;
            }
        }).filter((n: any) => n && typeof n.x === 'number' && typeof n.y === 'number');

        if (nodesWithPositions.length === 0) {
            console.warn(`Workflow "${group.name}" has no nodes with positions, skipping bounds calculation`);
            return;
        }

        const boundsResult = calculateGroupBounds(nodesWithPositions);
        if (!boundsResult) return;

        group.bounds = boundsResult.bounds;

        // Expand bounds to fit title if needed
        const fontFamily = '"Inter", "Segoe UI", "SF Pro Display", -apple-system, sans-serif';
        const titleText = `${group.name} (${group.nodes.length} nodes)`;
        const titleWidth = measureTextWidth(titleText, '19px', '500', fontFamily);
        const requiredWidth = titleWidth + GROUP_TITLE_OFFSET_X + 40;
        const currentWidth = group.bounds.maxX - group.bounds.minX;
        if (requiredWidth > currentWidth) {
            group.bounds.maxX = group.bounds.minX + requiredWidth;
        }

        group.centerX = (group.bounds.minX + group.bounds.maxX) / 2;
        group.centerY = (group.bounds.minY + group.bounds.maxY) / 2;

        // Update Y offset for next workflow
        currentYOffset = group.bounds.maxY + WORKFLOW_SPACING;
    });

    // Create colored dot patterns for each workflow group
    workflowGroups.forEach((group) => {
        createWorkflowPattern(defs, group.id, group.color);
    });

    state.setOriginalPositions(originalPositions);

    // Create expanded nodes (shared nodes become virtual copies per workflow)
    // This must happen BEFORE renderEdges() so edges can find node positions
    const expandedNodes: any[] = [];
    const sharedNodeCopies = new Map<string, string[]>();

    currentGraphData.nodes.forEach((node: any) => {
        const nodeWorkflows = workflowGroups.filter((g: any) =>
            g.nodes.includes(node.id) && g.nodes.length >= 3
        );

        if (nodeWorkflows.length > 1) {
            // Shared node: create a copy for each workflow
            nodeWorkflows.forEach((wf: any) => {
                const virtualId = getVirtualNodeId(node.id, wf.id);
                const pos = originalPositions.get(virtualId) || { x: 0, y: 0 };
                expandedNodes.push({
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
            expandedNodes.push(node);
        }
        // Nodes in no valid workflow (< 3 nodes) are skipped
    });

    state.setExpandedNodes(expandedNodes);
    state.setSharedNodeCopies(sharedNodeCopies);
}
