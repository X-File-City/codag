// HUD controls, zoom, and button tooltips
import * as state from './state';
import { getNodeWorkflowCount, generateEdgePath, getNodeOrCollapsedGroup, getVirtualNodeId } from './utils';
import { renderMinimap } from './minimap';
import { getNodeDimensions, positionTooltipNearMouse } from './helpers';
import {
    NODE_WIDTH, NODE_HEIGHT, NODE_HALF_WIDTH,
    GROUP_BOUNDS_PADDING_X, GROUP_BOUNDS_PADDING_TOP, GROUP_BOUNDS_PADDING_BOTTOM,
    TRANSITION_FAST, TRANSITION_NORMAL
} from './constants';

declare const d3: any;

export function setupControls(): void {
    // Attach click handlers via addEventListener
    document.getElementById('btn-zoom-in')?.addEventListener('click', zoomIn);
    document.getElementById('btn-zoom-out')?.addEventListener('click', zoomOut);
    document.getElementById('btn-fit-screen')?.addEventListener('click', () => fitToScreen());
    document.getElementById('btn-format')?.addEventListener('click', () => formatGraph());
    document.getElementById('btn-analyze')?.addEventListener('click', openAnalyzePanel);
    document.getElementById('legend-header')?.addEventListener('click', toggleLegend);

    // Setup button tooltips
    setupButtonTooltips();
}

function openAnalyzePanel(): void {
    console.log('openAnalyzePanel button clicked');
    state.vscode.postMessage({ command: 'openAnalyzePanel' });
}

function toggleLegend(): void {
    const legendContent = document.getElementById('legendContent');
    const legendToggle = document.getElementById('legendToggle');
    if (legendContent && legendToggle) {
        if (legendContent.style.display === 'none') {
            legendContent.style.display = 'block';
            legendToggle.textContent = '−';
        } else {
            legendContent.style.display = 'none';
            legendToggle.textContent = '+';
        }
    }
}

function zoomIn(): void {
    const { svg, zoom } = state;
    svg.transition().duration(TRANSITION_FAST).call(zoom.scaleBy, 1.3);
}

function zoomOut(): void {
    const { svg, zoom } = state;
    svg.transition().duration(TRANSITION_FAST).call(zoom.scaleBy, 0.7);
}

function setupButtonTooltips(): void {
    const tooltips = ['Zoom In', 'Zoom Out', 'Fit to Screen', 'Reset Layout', 'Analyze Files'];

    document.querySelectorAll('#controls button').forEach((btn, index) => {
        btn.addEventListener('mouseenter', (e) => showButtonTooltip(e as MouseEvent, tooltips[index]));
        btn.addEventListener('mousemove', (e) => {
            const tooltip = document.getElementById('buttonTooltip');
            if (tooltip) positionTooltipNearMouse(tooltip, (e as MouseEvent).clientX, (e as MouseEvent).clientY);
        });
        btn.addEventListener('mouseleave', hideButtonTooltip);
    });
}

function showButtonTooltip(event: MouseEvent, text: string): void {
    const tooltip = document.getElementById('buttonTooltip');
    if (!tooltip) return;

    tooltip.textContent = text;
    positionTooltipNearMouse(tooltip, event.clientX, event.clientY);
    tooltip.classList.add('visible');
}

function hideButtonTooltip(): void {
    const tooltip = document.getElementById('buttonTooltip');
    if (tooltip) tooltip.classList.remove('visible');
}

export function fitToScreen(): void {
    const { svg, zoom, currentGraphData } = state;
    const container = document.getElementById('graph');
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    if (currentGraphData.nodes.length === 0) return;

    const nodesWithPositions = currentGraphData.nodes.filter((n: any) => !isNaN(n.x) && !isNaN(n.y));
    if (nodesWithPositions.length === 0) return;

    const xs = nodesWithPositions.map((n: any) => n.x);
    const ys = nodesWithPositions.map((n: any) => n.y);
    const minX = Math.min(...xs) - NODE_HALF_WIDTH;
    const maxX = Math.max(...xs) + NODE_HALF_WIDTH;
    const minY = Math.min(...ys) - NODE_HEIGHT;
    const maxY = Math.max(...ys) + NODE_HEIGHT / 2;

    const fullWidth = maxX - minX;
    const fullHeight = maxY - minY;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    if (fullWidth === 0 || fullHeight === 0) return;

    const scale = 0.9 / Math.max(fullWidth / width, fullHeight / height);
    const translate = [width / 2 - scale * midX, height / 2 - scale * midY];

    svg.transition().duration(TRANSITION_NORMAL).call(
        zoom.transform,
        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
    );
}

export function formatGraph(): void {
    const { svg, currentGraphData, workflowGroups, originalPositions } = state;

    // Reset all nodes to their original dagre-computed positions
    currentGraphData.nodes.forEach((node: any) => {
        const orig = originalPositions.get(node.id);
        if (orig) {
            node.x = orig.x;
            node.y = orig.y;
            node.fx = orig.x;
            node.fy = orig.y;
        }
    });

    // Also update expandedNodes (which includes shared node virtual copies)
    state.expandedNodes.forEach((node: any) => {
        if (node._originalId) {
            // Shared node - look up position using virtual ID
            const pos = originalPositions.get(node.id);
            if (pos) {
                node.x = pos.x;
                node.y = pos.y;
                node.fx = pos.x;
                node.fy = pos.y;
            }
        }
    });

    // Recalculate group bounds (including shared nodes)
    workflowGroups.forEach((group: any) => {
        if (group.nodes.length < 3) return;

        // Get ALL nodes in this workflow (including shared)
        const allGroupNodes = currentGraphData.nodes.filter((n: any) =>
            group.nodes.includes(n.id)
        );
        if (allGroupNodes.length === 0) return;

        // Build positions array with width and height, handling shared nodes via virtual IDs
        const nodesWithBounds: { x: number; y: number; width: number; height: number }[] = [];
        allGroupNodes.forEach((node: any) => {
            const isShared = getNodeWorkflowCount(node.id, workflowGroups) > 1;
            const width = node.width || NODE_WIDTH;
            const height = node.height || NODE_HEIGHT;
            if (isShared) {
                // Shared nodes: get position from originalPositions using virtual ID
                const virtualId = getVirtualNodeId(node.id, group.id);
                const pos = originalPositions.get(virtualId);
                if (pos) {
                    nodesWithBounds.push({ x: pos.x, y: pos.y, width, height });
                }
            } else {
                // Non-shared nodes: use position directly from node
                if (typeof node.x === 'number' && typeof node.y === 'number') {
                    nodesWithBounds.push({ x: node.x, y: node.y, width, height });
                }
            }
        });
        if (nodesWithBounds.length === 0) return;

        // Calculate edges (not centers) using dynamic node dimensions
        const leftEdges = nodesWithBounds.map(n => n.x - n.width / 2);
        const rightEdges = nodesWithBounds.map(n => n.x + n.width / 2);
        const topEdges = nodesWithBounds.map(n => n.y - n.height / 2);
        const bottomEdges = nodesWithBounds.map(n => n.y + n.height / 2);

        group.bounds = {
            minX: Math.min(...leftEdges) - GROUP_BOUNDS_PADDING_X,
            maxX: Math.max(...rightEdges) + GROUP_BOUNDS_PADDING_X,
            minY: Math.min(...topEdges) - GROUP_BOUNDS_PADDING_TOP,
            maxY: Math.max(...bottomEdges) + GROUP_BOUNDS_PADDING_BOTTOM
        };

        group.centerX = (group.bounds.minX + group.bounds.maxX) / 2;
        group.centerY = (group.bounds.minY + group.bounds.maxY) / 2;
    });

    // Update DOM with transitions
    svg.selectAll('.group-background')
        .filter((d: any) => d.bounds && !isNaN(d.bounds.minX))
        .transition()
        .duration(TRANSITION_NORMAL)
        .attr('x', (d: any) => d.bounds.minX)
        .attr('y', (d: any) => d.bounds.minY)
        .attr('width', (d: any) => d.bounds.maxX - d.bounds.minX)
        .attr('height', (d: any) => d.bounds.maxY - d.bounds.minY);

    svg.selectAll('.group-title-expanded')
        .filter((d: any) => d.bounds && !isNaN(d.bounds.minX))
        .transition()
        .duration(TRANSITION_NORMAL)
        .attr('x', (d: any) => d.bounds.minX)
        .attr('y', (d: any) => d.bounds.minY - 8);

    // Update nodes
    svg.selectAll('.node')
        .filter((d: any) => !isNaN(d.x) && !isNaN(d.y))
        .transition()
        .duration(TRANSITION_NORMAL)
        .attr('transform', (d: any) => `translate(${d.x},${d.y})`);

    // Update edges
    const getNode = (nodeId: string) => {
        // Check if this is a component placeholder
        if (nodeId.startsWith('__comp_')) {
            const compId = nodeId.replace('__comp_', '');
            for (const group of workflowGroups) {
                for (const comp of (group.components || [])) {
                    if (comp.id === compId && comp.centerX !== undefined && comp.centerY !== undefined) {
                        return {
                            id: nodeId,
                            x: comp.centerX,
                            y: comp.centerY,
                            width: 100,
                            height: 60
                        };
                    }
                }
            }
        }
        // Check expandedNodes first (for virtual IDs of shared nodes)
        const expanded = state.expandedNodes.find((n: any) => n.id === nodeId);
        if (expanded) return expanded;
        // Fallback to original nodes or collapsed groups
        return getNodeOrCollapsedGroup(nodeId, currentGraphData.nodes, workflowGroups);
    };

    svg.selectAll('.link').transition().duration(TRANSITION_NORMAL)
        .attr('d', function(l: any) {
            const sourceNode = getNode(l.source);
            const targetNode = getNode(l.target);
            const { width: targetWidth, height: targetHeight } = getNodeDimensions(targetNode);
            const { width: sourceWidth, height: sourceHeight } = getNodeDimensions(sourceNode);
            return generateEdgePath(l, sourceNode, targetNode, workflowGroups, targetWidth, targetHeight, sourceWidth, sourceHeight, currentGraphData.edges);
        });

    svg.selectAll('.link-hover').transition().duration(TRANSITION_NORMAL)
        .attr('d', function(l: any) {
            const sourceNode = getNode(l.source);
            const targetNode = getNode(l.target);
            const { width: targetWidth, height: targetHeight } = getNodeDimensions(targetNode);
            const { width: sourceWidth, height: sourceHeight } = getNodeDimensions(sourceNode);
            return generateEdgePath(l, sourceNode, targetNode, workflowGroups, targetWidth, targetHeight, sourceWidth, sourceHeight, currentGraphData.edges);
        });

    // Update minimap
    renderMinimap();
}
