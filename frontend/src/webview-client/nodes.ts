// Node rendering
import * as state from './state';
import { sharedIcon } from './icons';
import { NODE_WIDTH, NODE_HEIGHT, NODE_BORDER_RADIUS } from './constants';
import { intersectRect } from './utils';

declare const d3: any;

export function renderNodes(
    dragstarted: (event: any, d: any) => void,
    dragged: (event: any, d: any) => void,
    dragended: (event: any, d: any) => void
): void {
    const { g, expandedNodes, sharedNodeCopies } = state;

    // Use expanded nodes from layout (already includes virtual copies for shared nodes)
    const nodesToRender = expandedNodes;

    // Create container for shared copy arrows BEFORE nodes (so arrows render below)
    const sharedArrowsContainer = g.append('g').attr('class', 'shared-arrows-container');
    state.setSharedArrowsContainer(sharedArrowsContainer);

    // Create nodes
    const node = g.append('g')
        .attr('class', 'nodes-container')
        .selectAll('g')
        .data(nodesToRender)
        .enter()
        .append('g')
        .attr('class', 'node')
        .attr('data-node-id', (d: any) => d.id)
        .call(d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended));

    // Add full background fill (dynamic dimensions) - LLM nodes get blue background
    node.append('rect')
        .attr('width', (d: any) => d.width || NODE_WIDTH)
        .attr('height', (d: any) => d.height || NODE_HEIGHT)
        .attr('x', (d: any) => -(d.width || NODE_WIDTH) / 2)
        .attr('y', (d: any) => -(d.height || NODE_HEIGHT) / 2)
        .attr('rx', NODE_BORDER_RADIUS)
        .style('fill', (d: any) => d.type === 'llm' ? '#64B5F6' : 'var(--vscode-editor-background)')
        .style('stroke', 'none');


    // Add neutral border (dynamic dimensions)
    node.append('rect')
        .attr('class', 'node-border')
        .attr('width', (d: any) => d.width || NODE_WIDTH)
        .attr('height', (d: any) => d.height || NODE_HEIGHT)
        .attr('x', (d: any) => -(d.width || NODE_WIDTH) / 2)
        .attr('y', (d: any) => -(d.height || NODE_HEIGHT) / 2)
        .attr('rx', NODE_BORDER_RADIUS)
        .style('fill', 'none')
        .style('stroke', 'var(--vscode-editorWidget-border)')
        .style('stroke-width', '2px')
        .style('pointer-events', 'all');

    // Add title centered in node with text wrapping
    const titleWrapper = node.append('foreignObject')
        .attr('x', (d: any) => -(d.width || NODE_WIDTH) / 2 + 4)
        .attr('y', (d: any) => -(d.height || NODE_HEIGHT) / 2 + 4)
        .attr('width', (d: any) => (d.width || NODE_WIDTH) - 8)
        .attr('height', (d: any) => (d.height || NODE_HEIGHT) - 8)
        .append('xhtml:div')
        .attr('class', 'node-title-wrapper')
        .style('width', '100%')
        .style('height', '100%')
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('justify-content', 'center');

    titleWrapper.append('xhtml:span')
        .attr('lang', 'en')
        .style('text-align', 'center')
        .style('color', (d: any) => d.type === 'llm' ? '#ffffff' : 'var(--vscode-editor-foreground)')
        .style('font-family', '"DM Sans", "Inter", "Segoe UI", -apple-system, sans-serif')
        .style('font-size', '15px')
        .style('font-weight', '400')
        .style('letter-spacing', '-0.01em')
        .style('line-height', '1.2')
        .style('word-wrap', 'break-word')
        .style('overflow-wrap', 'break-word')
        .text((d: any) => d.label);

    // Add SHARED badge (bottom-left) for shared node copies
    const sharedBadge = node.filter((d: any) => d._originalId != null)
        .append('g')
        .attr('class', 'shared-badge')
        .attr('transform', (d: any) => `translate(${-(d.width || NODE_WIDTH) / 2 + 6}, ${(d.height || NODE_HEIGHT) / 2 - 10}) scale(0.8)`);

    sharedBadge.append('g')
        .attr('class', 'shared-badge-icon')
        .html(sharedIcon);

    sharedBadge.append('text')
        .attr('class', 'shared-badge-text')
        .attr('x', 35)
        .attr('y', 6)
        .attr('dominant-baseline', 'middle')
        .style('font-size', '10px')
        .style('font-weight', '600')
        .style('fill', 'var(--vscode-descriptionForeground)')
        .style('letter-spacing', '0.05em')
        .text('SHARED');

    // Add selection indicator (camera corners) - dynamic based on node dimensions
    const cornerSize = 8;
    node.append('g')
        .attr('class', 'node-selection-indicator')
        .attr('data-node-id', (d: any) => d.id)
        .style('display', 'none')
        .each(function(this: SVGGElement, d: any) {
            const group = d3.select(this);
            const cornerOffsetX = (d.width || NODE_WIDTH) / 2 + 8;
            const cornerOffsetY = (d.height || NODE_HEIGHT) / 2 + 8;
            group.append('path').attr('d', `M -${cornerOffsetX} -${cornerOffsetY - cornerSize} L -${cornerOffsetX} -${cornerOffsetY} L -${cornerOffsetX - cornerSize} -${cornerOffsetY}`);
            group.append('path').attr('d', `M ${cornerOffsetX - cornerSize} -${cornerOffsetY} L ${cornerOffsetX} -${cornerOffsetY} L ${cornerOffsetX} -${cornerOffsetY - cornerSize}`);
            group.append('path').attr('d', `M -${cornerOffsetX} ${cornerOffsetY - cornerSize} L -${cornerOffsetX} ${cornerOffsetY} L -${cornerOffsetX - cornerSize} ${cornerOffsetY}`);
            group.append('path').attr('d', `M ${cornerOffsetX - cornerSize} ${cornerOffsetY} L ${cornerOffsetX} ${cornerOffsetY} L ${cornerOffsetX} ${cornerOffsetY - cornerSize}`);
        });

    // Tooltip on hover
    node.append('title')
        .text((d: any) => {
            let text = `${d.label}\nType: ${d.type}`;
            if (d.description) {
                text += `\n\n${d.description}`;
            }
            return text;
        });

    // Set initial positions
    node.attr('transform', (d: any) => {
        if (d._originalId != null) {
            console.log(`[RENDER] Shared node ${d.id} rendered at (${d.x}, ${d.y})`);
        }
        return `translate(${d.x},${d.y})`;
    });

    // Add hover behavior for shared nodes to show arrows to copies
    node.filter((d: any) => d._originalId != null)
        .on('mouseenter.sharedArrows', function(event: any, d: any) {
            const copies = sharedNodeCopies.get(d._originalId);
            if (!copies || copies.length < 2) return;

            // Find other copies and draw arrows to them
            copies.filter(vid => vid !== d.id).forEach(otherVid => {
                const otherNode = nodesToRender.find((n: any) => n.id === otherVid);
                if (otherNode && typeof otherNode.x === 'number' && typeof otherNode.y === 'number') {
                    drawSharedCopyArrow(sharedArrowsContainer, d, otherNode);
                }
            });
        })
        .on('mouseleave.sharedArrows', function() {
            sharedArrowsContainer.selectAll('.shared-copy-arrow').remove();
        });

    state.setNode(node);
}

/**
 * Draw a curved dotted arrow between two shared node copies
 */
function drawSharedCopyArrow(container: any, fromNode: any, toNode: any): void {
    // Calculate edge intersection points at node boundaries (use dynamic widths)
    const fromWidth = fromNode.width || NODE_WIDTH;
    const toWidth = toNode.width || NODE_WIDTH;
    const startPoint = intersectRect(toNode, fromNode, toWidth, NODE_HEIGHT);
    const endPoint = intersectRect(fromNode, toNode, fromWidth, NODE_HEIGHT);

    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 10) return; // Too close, skip arrow

    // Calculate control point for quadratic bezier (curve outward)
    const midX = (startPoint.x + endPoint.x) / 2;
    const midY = (startPoint.y + endPoint.y) / 2;

    // Perpendicular offset for curve (proportional to distance)
    const curveOffset = Math.min(dist * 0.25, 100);
    const perpX = -dy / dist * curveOffset;
    const perpY = dx / dist * curveOffset;

    const ctrlX = midX + perpX;
    const ctrlY = midY + perpY;

    const path = `M${startPoint.x},${startPoint.y} Q${ctrlX},${ctrlY} ${endPoint.x},${endPoint.y}`;

    container.append('path')
        .attr('class', 'shared-copy-arrow')
        .attr('d', path)
        .attr('marker-end', 'url(#arrowhead)');
}

/**
 * Update shared copy arrows during drag (if any are visible)
 */
export function updateSharedArrows(draggedNode: any): void {
    const { sharedArrowsContainer, sharedNodeCopies, expandedNodes } = state;
    if (!sharedArrowsContainer || !draggedNode._originalId) return;

    // Clear existing arrows
    sharedArrowsContainer.selectAll('.shared-copy-arrow').remove();

    // Get all copies of this shared node
    const copies = sharedNodeCopies.get(draggedNode._originalId);
    if (!copies || copies.length < 2) return;

    // Check if we're hovering on this node (arrows should be visible)
    const nodeElement = document.querySelector(`.node[data-node-id="${draggedNode.id}"]`);
    if (!nodeElement?.matches(':hover')) return;

    // Redraw arrows to other copies
    copies.filter(vid => vid !== draggedNode.id).forEach(otherVid => {
        const otherNode = expandedNodes.find((n: any) => n.id === otherVid);
        if (otherNode && typeof otherNode.x === 'number' && typeof otherNode.y === 'number') {
            drawSharedCopyArrow(sharedArrowsContainer, draggedNode, otherNode);
        }
    });
}

/**
 * Pulse animation for newly added nodes
 */
export function pulseNodes(nodeIds: string[]): void {
    nodeIds.forEach(id => {
        d3.select(`.node[data-node-id="${id}"]`)
            .transition().duration(200)
            .style('opacity', 0.3)
            .transition().duration(400)
            .style('opacity', 1)
            .transition().duration(200)
            .style('opacity', 0.3)
            .transition().duration(400)
            .style('opacity', 1);
    });
}
