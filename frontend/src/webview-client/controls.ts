// HUD controls, zoom, and button tooltips
import * as state from './state';
import { getNodeWorkflowCount, generateEdgePath, getNodeOrCollapsedGroup } from './utils';
import { renderMinimap } from './minimap';

declare const d3: any;

export function setupControls(updateGroupVisibility: () => void): void {
    // Attach click handlers via addEventListener
    document.getElementById('btn-zoom-in')?.addEventListener('click', zoomIn);
    document.getElementById('btn-zoom-out')?.addEventListener('click', zoomOut);
    document.getElementById('btn-fit-screen')?.addEventListener('click', () => fitToScreen());
    document.getElementById('btn-expand-all')?.addEventListener('click', () => toggleExpandAll(updateGroupVisibility));
    document.getElementById('btn-format')?.addEventListener('click', () => formatGraph(updateGroupVisibility));
    document.getElementById('btn-refresh')?.addEventListener('click', refreshAnalysis);
    document.getElementById('legend-header')?.addEventListener('click', toggleLegend);

    // Setup button tooltips
    setupButtonTooltips();
}

function refreshAnalysis(): void {
    console.log('refreshAnalysis button clicked');
    state.vscode.postMessage({ command: 'refreshAnalysis' });
}

function toggleExpandAll(updateGroupVisibility: () => void): void {
    const { workflowGroups } = state;
    if (!workflowGroups || workflowGroups.length === 0) return;

    const anyExpanded = workflowGroups.some((g: any) => !g.collapsed && g.id !== 'group_orphans');
    const shouldCollapse = anyExpanded;

    workflowGroups.forEach((g: any) => {
        if (g.id !== 'group_orphans') {
            g.collapsed = shouldCollapse;
        }
    });

    updateGroupVisibility();
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
    svg.transition().duration(300).call(zoom.scaleBy, 1.3);
}

function zoomOut(): void {
    const { svg, zoom } = state;
    svg.transition().duration(300).call(zoom.scaleBy, 0.7);
}

function setupButtonTooltips(): void {
    const tooltips = ['Zoom In', 'Zoom Out', 'Fit to Screen', 'Expand/Collapse All Workflows', 'Reset Layout', 'Reanalyze Entire Workspace'];

    document.querySelectorAll('#controls button').forEach((btn, index) => {
        btn.addEventListener('mouseenter', (e) => showButtonTooltip(e as MouseEvent, tooltips[index]));
        btn.addEventListener('mousemove', (e) => {
            const tooltip = document.getElementById('buttonTooltip');
            if (tooltip) positionTooltip(tooltip, (e as MouseEvent).clientX, (e as MouseEvent).clientY);
        });
        btn.addEventListener('mouseleave', hideButtonTooltip);
    });
}

function showButtonTooltip(event: MouseEvent, text: string): void {
    const tooltip = document.getElementById('buttonTooltip');
    if (!tooltip) return;

    tooltip.textContent = text;
    positionTooltip(tooltip, event.clientX, event.clientY);
    tooltip.classList.add('visible');
}

function positionTooltip(tooltip: HTMLElement, mouseX: number, mouseY: number): void {
    tooltip.style.opacity = '0';
    tooltip.style.display = 'block';
    const tooltipRect = tooltip.getBoundingClientRect();
    tooltip.style.opacity = '';
    tooltip.style.display = '';

    let left = mouseX + 10;
    let top = mouseY - 30;

    if (left + tooltipRect.width > window.innerWidth) {
        left = mouseX - tooltipRect.width - 10;
    }
    if (left < 0) left = 10;
    if (top < 0) top = mouseY + 10;
    if (top + tooltipRect.height > window.innerHeight) {
        top = window.innerHeight - tooltipRect.height - 10;
    }

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
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

    const nodeWidth = 140;
    const nodeHeight = 70;
    const xs = nodesWithPositions.map((n: any) => n.x);
    const ys = nodesWithPositions.map((n: any) => n.y);
    const minX = Math.min(...xs) - nodeWidth / 2;
    const maxX = Math.max(...xs) + nodeWidth / 2;
    const minY = Math.min(...ys) - nodeHeight;
    const maxY = Math.max(...ys) + nodeHeight / 2;

    const fullWidth = maxX - minX;
    const fullHeight = maxY - minY;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    if (fullWidth === 0 || fullHeight === 0) return;

    const scale = 0.9 / Math.max(fullWidth / width, fullHeight / height);
    const translate = [width / 2 - scale * midX, height / 2 - scale * midY];

    svg.transition().duration(500).call(
        zoom.transform,
        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
    );
}

export function formatGraph(updateGroupVisibility: () => void): void {
    const { svg, currentGraphData, workflowGroups, originalPositions, link, linkHover } = state;

    console.log('formatGraph button clicked');

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

    // Recalculate group bounds
    workflowGroups.forEach((group: any) => {
        if (group.nodes.length < 3) return;

        const groupNodes = currentGraphData.nodes.filter((n: any) =>
            group.nodes.includes(n.id) && getNodeWorkflowCount(n.id, workflowGroups) === 1
        );
        if (groupNodes.length === 0) return;

        const xs = groupNodes.map((n: any) => n.x);
        const ys = groupNodes.map((n: any) => n.y);

        group.bounds = {
            minX: Math.min(...xs) - 90,
            maxX: Math.max(...xs) + 90,
            minY: Math.min(...ys) - 75,
            maxY: Math.max(...ys) + 55
        };

        group.centerX = (group.bounds.minX + group.bounds.maxX) / 2;
        group.centerY = (group.bounds.minY + group.bounds.maxY) / 2;
    });

    // Update DOM with transitions
    svg.selectAll('.group-background')
        .filter((d: any) => d.bounds && !isNaN(d.bounds.minX))
        .transition()
        .duration(500)
        .attr('x', (d: any) => d.bounds.minX)
        .attr('y', (d: any) => d.bounds.minY)
        .attr('width', (d: any) => d.bounds.maxX - d.bounds.minX)
        .attr('height', (d: any) => d.bounds.maxY - d.bounds.minY);

    svg.selectAll('.group-title-expanded')
        .filter((d: any) => d.bounds && !isNaN(d.bounds.minX))
        .transition()
        .duration(500)
        .attr('x', (d: any) => d.bounds.minX + 40)
        .attr('y', (d: any) => d.bounds.minY + 24);

    svg.selectAll('.group-collapse-btn rect')
        .filter((d: any) => d.bounds && !isNaN(d.bounds.minX))
        .transition()
        .duration(500)
        .attr('x', (d: any) => d.bounds.minX + 10)
        .attr('y', (d: any) => d.bounds.minY + 8);

    svg.selectAll('.group-collapse-btn text')
        .filter((d: any) => d.bounds && !isNaN(d.bounds.minX))
        .transition()
        .duration(500)
        .attr('x', (d: any) => d.bounds.minX + 22)
        .attr('y', (d: any) => d.bounds.minY + 24);

    // Update collapsed groups
    svg.selectAll('.collapsed-group-node rect')
        .filter((d: any) => !isNaN(d.centerX) && !isNaN(d.centerY))
        .transition()
        .duration(500)
        .attr('x', (d: any) => d.centerX - 130)
        .attr('y', (d: any) => d.centerY - 65);

    svg.selectAll('.collapsed-group-node')
        .filter((d: any) => !isNaN(d.centerX) && !isNaN(d.centerY))
        .each(function(this: SVGGElement, d: any) {
            const group = d3.select(this);
            const texts = group.selectAll('text').nodes();

            if (texts[0]) {
                d3.select(texts[0]).transition().duration(500)
                    .attr('x', d.centerX).attr('y', d.centerY - 20);
            }
            if (texts[1]) {
                d3.select(texts[1]).transition().duration(500)
                    .attr('x', d.centerX).attr('y', d.centerY + 5);
            }
            if (texts[2]) {
                d3.select(texts[2]).transition().duration(500)
                    .attr('x', d.centerX).attr('y', d.centerY + 30);
            }
        });

    // Update nodes
    svg.selectAll('.node')
        .filter((d: any) => !isNaN(d.x) && !isNaN(d.y))
        .transition()
        .duration(500)
        .attr('transform', (d: any) => `translate(${d.x},${d.y})`);

    // Update edges
    const getNode = (nodeId: string) => getNodeOrCollapsedGroup(nodeId, currentGraphData.nodes, workflowGroups);

    svg.selectAll('.link').transition().duration(500)
        .attr('d', function(l: any) {
            const sourceNode = getNode(l.source);
            const targetNode = getNode(l.target);
            const targetWidth = targetNode?.isCollapsedGroup ? 260 : 140;
            const targetHeight = targetNode?.isCollapsedGroup ? 130 : 70;
            return generateEdgePath(l, sourceNode, targetNode, workflowGroups, targetWidth, targetHeight);
        });

    svg.selectAll('.link-hover').transition().duration(500)
        .attr('d', function(l: any) {
            const sourceNode = getNode(l.source);
            const targetNode = getNode(l.target);
            const targetWidth = targetNode?.isCollapsedGroup ? 260 : 140;
            const targetHeight = targetNode?.isCollapsedGroup ? 130 : 70;
            return generateEdgePath(l, sourceNode, targetNode, workflowGroups, targetWidth, targetHeight);
        });

    // Update minimap
    renderMinimap();
}
