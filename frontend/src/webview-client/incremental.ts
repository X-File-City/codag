// Incremental graph updates
import * as state from './state';
import { snapToGrid, generateEdgePath, getNodeWorkflowCount, getNodeOrCollapsedGroup } from './utils';
import { getNodeIcon } from './icons';
import { SavedState, GraphDiff } from './types';
import { openPanel, closePanel } from './panel';
import { renderMinimap, updateMinimapViewport } from './minimap';
import { updateGroupVisibility } from './visibility';

declare const d3: any;
declare const dagre: any;

const TYPE_COLORS: Record<string, string> = {
    'trigger': '#FFB74D',
    'llm': '#64B5F6',
    'tool': '#81C784',
    'decision': '#BA68C8',
    'integration': '#FF8A65',
    'memory': '#4DB6AC',
    'parser': '#A1887F',
    'output': '#90A4AE'
};

export function captureState(): SavedState {
    const { svg, zoom, workflowGroups, currentGraphData, currentlyOpenNodeId } = state;
    return {
        zoomTransform: d3.zoomTransform(svg.node()),
        collapsedWorkflows: workflowGroups.filter((g: any) => g.collapsed).map((g: any) => g.id),
        selectedNodeId: currentlyOpenNodeId,
        nodePositions: new Map(currentGraphData.nodes.map((n: any) => [n.id, { x: n.x, y: n.y, fx: n.fx, fy: n.fy }]))
    };
}

export function restoreState(savedState: SavedState): void {
    const { svg, zoom, workflowGroups, currentGraphData } = state;

    // Restore zoom transform
    svg.call(zoom.transform, savedState.zoomTransform);

    // Restore collapsed states
    workflowGroups.forEach((g: any) => {
        g.collapsed = savedState.collapsedWorkflows.includes(g.id);
    });
    updateGroupVisibility();

    // Re-select node if it still exists
    if (savedState.selectedNodeId) {
        const node = currentGraphData.nodes.find((n: any) => n.id === savedState.selectedNodeId);
        if (node) {
            openPanel(node);
        } else {
            closePanel();
        }
    }

    updateMinimapViewport();
}

export function applyIncrementalUpdate(diff: GraphDiff, savedState: SavedState): void {
    const { g, currentGraphData, originalPositions, workflowGroups } = state;

    console.log('[webview] Applying incremental update:', diff);

    // Preserve positions for existing nodes
    currentGraphData.nodes.forEach((n: any) => {
        const pos = savedState.nodePositions.get(n.id);
        if (pos) {
            n.x = pos.x;
            n.y = pos.y;
            n.fx = pos.fx;
            n.fy = pos.fy;
            originalPositions.set(n.id, { x: n.x, y: n.y });
        }
    });

    // Layout new nodes
    if (diff.nodes.added.length > 0) {
        layoutNewNodes(diff.nodes.added);
    }

    // Remove nodes
    diff.nodes.removed.forEach((nodeId: string) => {
        g.select(`.node[data-node-id="${nodeId}"]`).remove();
    });

    // Update existing nodes
    diff.nodes.updated.forEach((updatedNode: any) => {
        const nodeEl = g.select(`.node[data-node-id="${updatedNode.id}"]`);
        if (!nodeEl.empty()) {
            nodeEl.select('.node-title').text(updatedNode.label);
            const nodeRect = nodeEl.select('.node-background');
            nodeRect.classed('entry-point', updatedNode.isEntryPoint || false);
            nodeRect.classed('exit-point', updatedNode.isExitPoint || false);
            nodeRect.classed('critical-path', updatedNode.isCriticalPath || false);
        }
    });

    // Add new nodes
    diff.nodes.added.forEach((newNode: any) => {
        renderNode(newNode);
    });

    // Remove edges
    diff.edges.removed.forEach((edge: any) => {
        const edgeKey = `${edge.source}->${edge.target}`;
        g.select(`.edge-paths-container .link-group[data-edge-key="${edgeKey}"]`).remove();
    });

    // Update existing edges
    diff.edges.updated.forEach((updatedEdge: any) => {
        const edgeKey = `${updatedEdge.source}->${updatedEdge.target}`;
        const edgeEl = g.select(`.edge-paths-container .link-group[data-edge-key="${edgeKey}"]`);
        if (!edgeEl.empty()) {
            edgeEl.select('.link').classed('critical-path', updatedEdge.isCriticalPath || false);
        }
    });

    // Add new edges
    diff.edges.added.forEach((newEdge: any) => {
        renderEdge(newEdge);
    });

    // Update all edge paths
    updateAllEdgePaths();

    // Recalculate bounds for workflows
    recalculateWorkflowBounds(workflowGroups);

    // Update workflow group DOM elements
    updateWorkflowGroups(workflowGroups);

    // Re-render minimap
    renderMinimap();
}

function layoutNewNodes(newNodes: any[]): void {
    const { currentGraphData, workflowGroups, originalPositions } = state;

    const nodesByWorkflow = new Map<string, { workflow: any; nodes: any[] }>();
    newNodes.forEach((newNode: any) => {
        const workflow = workflowGroups.find((g: any) => g.nodes.includes(newNode.id));
        const wfId = workflow ? workflow.id : '__orphan__';
        if (!nodesByWorkflow.has(wfId)) {
            nodesByWorkflow.set(wfId, { workflow, nodes: [] });
        }
        nodesByWorkflow.get(wfId)!.nodes.push(newNode);
    });

    let workflowYOffset = 0;

    nodesByWorkflow.forEach(({ workflow, nodes: wfNewNodes }) => {
        if (!workflow) {
            // Orphan nodes
            const existingYs = currentGraphData.nodes
                .filter((n: any) => n.y !== undefined && !isNaN(n.y))
                .map((n: any) => n.y);
            let offsetY = existingYs.length > 0 ? Math.max(...existingYs) + 150 : 0;

            wfNewNodes.forEach((n: any) => {
                n.x = snapToGrid(200);
                n.y = snapToGrid(offsetY);
                n.fx = n.x;
                n.fy = n.y;
                offsetY += 150;
                originalPositions.set(n.id, { x: n.x, y: n.y });
            });
            return;
        }

        const existingPositionedNodes = workflow.nodes
            .map((id: string) => currentGraphData.nodes.find((n: any) => n.id === id))
            .filter((n: any) => n && n.x !== undefined && !isNaN(n.x));

        const dagreGraph = new dagre.graphlib.Graph();
        dagreGraph.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 60 });
        dagreGraph.setDefaultEdgeLabel(() => ({}));

        workflow.nodes.forEach((nodeId: string) => {
            const existingNode = currentGraphData.nodes.find((n: any) => n.id === nodeId);
            if (existingNode) {
                if (existingNode.x !== undefined && existingNode.y !== undefined) {
                    dagreGraph.setNode(nodeId, { width: 140, height: 70, x: existingNode.x, y: existingNode.y });
                } else {
                    dagreGraph.setNode(nodeId, { width: 140, height: 70 });
                }
            }
        });

        currentGraphData.edges.forEach((edge: any) => {
            if (workflow.nodes.includes(edge.source) && workflow.nodes.includes(edge.target)) {
                dagreGraph.setEdge(edge.source, edge.target);
            }
        });

        dagre.layout(dagreGraph);

        if (existingPositionedNodes.length === 0) {
            workflow.nodes.forEach((nodeId: string) => {
                const node = currentGraphData.nodes.find((n: any) => n.id === nodeId);
                const pos = dagreGraph.node(nodeId);
                if (node && pos) {
                    node.x = snapToGrid(pos.x);
                    node.y = snapToGrid(pos.y + workflowYOffset);
                    node.fx = node.x;
                    node.fy = node.y;
                    originalPositions.set(node.id, { x: node.x, y: node.y });
                }
            });

            const wfNodes = workflow.nodes
                .map((id: string) => currentGraphData.nodes.find((n: any) => n.id === id))
                .filter((n: any) => n && n.y !== undefined);
            if (wfNodes.length > 0) {
                workflowYOffset = Math.max(...wfNodes.map((n: any) => n.y)) + 200;
            }
        } else {
            wfNewNodes.forEach((newNode: any) => {
                const pos = dagreGraph.node(newNode.id);
                if (pos) {
                    newNode.x = snapToGrid(pos.x);
                    newNode.y = snapToGrid(pos.y);
                    newNode.fx = newNode.x;
                    newNode.fy = newNode.y;
                    originalPositions.set(newNode.id, { x: newNode.x, y: newNode.y });
                }
            });
        }
    });
}

function renderNode(nodeData: any): void {
    const { g } = state;

    const nodeGroup = g.select('.nodes-container').append('g')
        .datum(nodeData)
        .attr('class', 'node')
        .attr('data-node-id', nodeData.id)
        .attr('transform', `translate(${nodeData.x},${nodeData.y})`);

    nodeGroup.append('rect')
        .attr('width', 140).attr('height', 70).attr('x', -70).attr('y', -35).attr('rx', 4)
        .style('fill', 'var(--vscode-editor-background)').style('stroke', 'none');

    nodeGroup.append('path')
        .attr('class', 'node-header')
        .attr('d', 'M -65,-35 L 65,-35 A 4,4 0 0,1 69,-31 L 69,-11 L -69,-11 L -69,-31 A 4,4 0 0,1 -65,-35 Z')
        .style('fill', TYPE_COLORS[nodeData.type] || '#90A4AE')
        .style('opacity', 0.5).style('stroke', 'none');

    const classes = [];
    if (nodeData.isCriticalPath) classes.push('critical-path');
    if (nodeData.isEntryPoint) classes.push('entry-point');
    if (nodeData.isExitPoint) classes.push('exit-point');

    nodeGroup.append('rect')
        .attr('width', 140).attr('height', 70).attr('x', -70).attr('y', -35).attr('rx', 4)
        .attr('class', classes.join(' '))
        .style('fill', 'none').style('pointer-events', 'all');

    nodeGroup.append('text')
        .attr('class', 'node-title').attr('y', -21).attr('dominant-baseline', 'middle')
        .text(nodeData.label);

    nodeGroup.append('g')
        .attr('class', `node-icon ${nodeData.type}`)
        .attr('transform', 'translate(44, 10) scale(0.8)')
        .html(getNodeIcon(nodeData.type));

    nodeGroup.append('text')
        .attr('class', 'node-type').text(nodeData.type.toUpperCase())
        .attr('x', 40).attr('y', 21).attr('dominant-baseline', 'middle').style('text-anchor', 'end');
}

function renderEdge(edgeData: any): void {
    const { g, currentGraphData, workflowGroups } = state;

    const sourceNode = currentGraphData.nodes.find((n: any) => n.id === edgeData.source);
    const targetNode = currentGraphData.nodes.find((n: any) => n.id === edgeData.target);
    if (!sourceNode || !targetNode) return;

    const edgeKey = `${edgeData.source}->${edgeData.target}`;
    const pathClass = `link${edgeData.isCriticalPath ? ' critical-path' : ''}`;

    const edgeGroup = g.select('.edge-paths-container').append('g')
        .datum(edgeData)
        .attr('class', 'link-group')
        .attr('data-edge-key', edgeKey);

    edgeGroup.append('path')
        .attr('class', pathClass)
        .attr('d', generateEdgePath(edgeData, sourceNode, targetNode, workflowGroups, 140, 70))
        .attr('marker-end', 'url(#arrowhead)');

    edgeGroup.append('path')
        .attr('class', 'link-hover')
        .attr('d', generateEdgePath(edgeData, sourceNode, targetNode, workflowGroups, 140, 70));
}

function updateAllEdgePaths(): void {
    const { g, currentGraphData, workflowGroups } = state;

    g.selectAll('.link-group').each(function(this: SVGGElement, edgeData: any) {
        const sourceNode = getNodeOrCollapsedGroup(edgeData.source, currentGraphData.nodes, workflowGroups);
        const targetNode = getNodeOrCollapsedGroup(edgeData.target, currentGraphData.nodes, workflowGroups);
        const targetWidth = targetNode?.isCollapsedGroup ? 260 : 140;
        const targetHeight = targetNode?.isCollapsedGroup ? 130 : 70;

        const path = generateEdgePath(edgeData, sourceNode, targetNode, workflowGroups, targetWidth, targetHeight);

        d3.select(this).select('.link').attr('d', path);
        d3.select(this).select('.link-hover').attr('d', path);
    });
}

function recalculateWorkflowBounds(groups: any[]): void {
    const { currentGraphData } = state;

    groups.forEach((group: any) => {
        if (group.bounds) return;

        const allGroupNodes = currentGraphData.nodes.filter((n: any) => group.nodes.includes(n.id));
        if (allGroupNodes.length < 3) return;

        const xs = allGroupNodes.map((n: any) => n.x).filter((x: number) => x !== undefined && !isNaN(x));
        const ys = allGroupNodes.map((n: any) => n.y).filter((y: number) => y !== undefined && !isNaN(y));

        if (xs.length === 0 || ys.length === 0) return;

        group.bounds = {
            minX: Math.min(...xs) - 90,
            maxX: Math.max(...xs) + 90,
            minY: Math.min(...ys) - 75,
            maxY: Math.max(...ys) + 55
        };
        group.centerX = (group.bounds.minX + group.bounds.maxX) / 2;
        group.centerY = (group.bounds.minY + group.bounds.maxY) / 2;
    });
}

function updateWorkflowGroups(groups: any[]): void {
    const { g } = state;

    const groupsWithBounds = groups.filter((grp: any) => grp.bounds && grp.nodes.length >= 3);
    const groupContainer = g.select('.groups');

    const existingGroupIds = new Set<string>();
    groupContainer.selectAll('.workflow-group').each(function(d: any) {
        if (d && d.id) existingGroupIds.add(d.id);
    });

    groupContainer.selectAll('.workflow-group').each(function(this: SVGGElement, d: any) {
        const group = groupsWithBounds.find((grp: any) => grp.id === d.id);
        if (!group) {
            d3.select(this).remove();
            return;
        }

        d3.select(this).datum(group);

        d3.select(this).select('.group-background')
            .attr('x', group.bounds.minX)
            .attr('y', group.bounds.minY)
            .attr('width', group.bounds.maxX - group.bounds.minX)
            .attr('height', group.bounds.maxY - group.bounds.minY);

        d3.select(this).select('.group-title-expanded')
            .attr('x', group.bounds.minX + 40)
            .attr('y', group.bounds.minY + 24)
            .text(`${group.name} (${group.nodes.length} nodes)`);

        d3.select(this).select('.group-collapse-btn rect')
            .attr('x', group.bounds.minX + 10)
            .attr('y', group.bounds.minY + 8);
        d3.select(this).select('.group-collapse-btn text')
            .attr('x', group.bounds.minX + 22)
            .attr('y', group.bounds.minY + 24);
    });
}
