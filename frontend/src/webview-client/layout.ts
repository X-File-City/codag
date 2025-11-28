// Dagre layout and workflow stacking
import * as state from './state';
import { snapToGrid, getNodeWorkflowCount } from './utils';
import { createWorkflowPattern } from './setup';

declare const dagre: any;
declare const d3: any;

export function layoutWorkflows(defs: any): void {
    const { currentGraphData, workflowGroups, originalPositions, g } = state;

    let currentYOffset = 0;
    const workflowSpacing = 150;

    workflowGroups.forEach((group, idx) => {
        // Get ALL nodes in this workflow (including shared nodes)
        const allGroupNodes = currentGraphData.nodes.filter((n: any) =>
            group.nodes.includes(n.id)
        );

        // Get ONLY exclusive nodes (for bounds calculation)
        const exclusiveGroupNodes = allGroupNodes.filter((n: any) =>
            getNodeWorkflowCount(n.id, workflowGroups) === 1
        );

        // Skip groups with less than 3 nodes total
        if (allGroupNodes.length < 3) return;

        // Create separate Dagre graph for this workflow
        const dagreGraph = new dagre.graphlib.Graph();
        dagreGraph.setGraph({
            rankdir: 'LR',
            nodesep: 50,
            ranksep: 60,
            marginx: 30,
            marginy: 30
        });
        dagreGraph.setDefaultEdgeLabel(() => ({}));

        // Add ALL nodes to Dagre
        allGroupNodes.forEach((node: any) => {
            dagreGraph.setNode(node.id, { width: 140, height: 70 });
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
            if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number' ||
                isNaN(pos.x) || isNaN(pos.y)) {
                console.warn(`Invalid position for node ${node.id} (${node.label}), using fallback`);
                node.x = 0;
                node.y = currentYOffset;
            } else {
                node.x = snapToGrid(pos.x);
                node.y = snapToGrid(pos.y + currentYOffset);
            }
            node.fx = node.x;
            node.fy = node.y;
            originalPositions.set(node.id, { x: node.x, y: node.y });
        });

        // Calculate bounds ONLY from exclusive nodes
        if (exclusiveGroupNodes.length === 0) {
            console.warn(`Workflow "${group.name}" has only shared nodes, skipping bounds calculation`);
            return;
        }

        const xs = exclusiveGroupNodes.map((n: any) => n.x);
        const ys = exclusiveGroupNodes.map((n: any) => n.y);

        group.bounds = {
            minX: Math.min(...xs) - 90,
            maxX: Math.max(...xs) + 90,
            minY: Math.min(...ys) - 75,
            maxY: Math.max(...ys) + 55
        };

        // Calculate center for collapsed state
        group.centerX = (group.bounds.minX + group.bounds.maxX) / 2;
        group.centerY = (group.bounds.minY + group.bounds.maxY) / 2;

        // Update Y offset for next workflow
        currentYOffset = group.bounds.maxY + workflowSpacing;
    });

    // Create colored dot patterns for each workflow group
    workflowGroups.forEach((group) => {
        createWorkflowPattern(defs, group.id, group.color);
    });

    state.setOriginalPositions(originalPositions);
}
