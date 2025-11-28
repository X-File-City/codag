// Edge rendering and hover effects
import * as state from './state';
import { generateEdgePath, getNodeOrCollapsedGroup } from './utils';

declare const d3: any;

export function renderEdges(): void {
    const { g, currentGraphData, workflowGroups } = state;

    // Filter nodes to only render those in workflow groups WITH 3+ NODES
    const allWorkflowNodeIds = new Set<string>();
    workflowGroups.forEach((grp: any) => {
        if (grp.nodes.length >= 3) {
            grp.nodes.forEach((id: string) => allWorkflowNodeIds.add(id));
        }
    });

    // Filter edges to only those where BOTH nodes are rendered
    const edgesToRender = currentGraphData.edges.filter((e: any) =>
        allWorkflowNodeIds.has(e.source) && allWorkflowNodeIds.has(e.target)
    );

    // Create container for edge paths
    const edgePathsContainer = g.append('g').attr('class', 'edge-paths-container');
    state.setEdgePathsContainer(edgePathsContainer);

    // Create edge path groups
    const linkGroup = edgePathsContainer
        .selectAll('g')
        .data(edgesToRender)
        .enter()
        .append('g')
        .attr('class', 'link-group')
        .attr('data-edge-key', (d: any) => `${d.source}->${d.target}`);

    const link = linkGroup.append('path')
        .attr('class', (d: any) => d.isCriticalPath ? 'link critical-path' : 'link')
        .attr('marker-end', 'url(#arrowhead)');

    // Add invisible wider path for easier hovering
    const linkHover = linkGroup.insert('path', '.link')
        .attr('class', 'link-hover')
        .style('stroke', 'transparent')
        .style('stroke-width', '20px')
        .style('fill', 'none')
        .style('cursor', 'pointer')
        .on('mouseenter', function(event: any, d: any) {
            // Highlight edge path
            const index = edgesToRender.indexOf(d);
            const linkElement = d3.select(edgePathsContainer.node().children[index]).select('.link');

            if (d.isCriticalPath) {
                linkElement.style('stroke', '#FF9999').style('stroke-width', '3px');
            } else {
                linkElement.style('stroke', '#00d9ff').style('stroke-width', '3px');
            }

            // Show tooltip
            showEdgeTooltip(d, event);
        })
        .on('mousemove', function(event: any, d: any) {
            // Update tooltip position as mouse moves
            updateTooltipPosition(event);
        })
        .on('mouseleave', function(event: any, d: any) {
            // Reset edge path
            const index = edgesToRender.indexOf(d);
            const linkElement = d3.select(edgePathsContainer.node().children[index]).select('.link');

            if (d.isCriticalPath) {
                linkElement.style('stroke', '#FF6B6B').style('stroke-width', '2px');
            } else {
                linkElement.style('stroke', null).style('stroke-width', null);
            }

            // Hide tooltip
            const tooltip = document.getElementById('edgeTooltip');
            if (tooltip) tooltip.style.display = 'none';
        })
        .on('click', function(event: any, d: any) {
            event.stopPropagation();
            if (d.sourceLocation) {
                state.vscode.postMessage({
                    command: 'openFile',
                    file: d.sourceLocation.file,
                    line: d.sourceLocation.line
                });
            }
        });

    // Set initial edge paths
    link.attr('d', (d: any) => {
        const sourceNode = currentGraphData.nodes.find((n: any) => n.id === d.source);
        const targetNode = currentGraphData.nodes.find((n: any) => n.id === d.target);
        return generateEdgePath(d, sourceNode, targetNode, workflowGroups);
    });

    linkHover.attr('d', (d: any) => {
        const sourceNode = currentGraphData.nodes.find((n: any) => n.id === d.source);
        const targetNode = currentGraphData.nodes.find((n: any) => n.id === d.target);
        return generateEdgePath(d, sourceNode, targetNode, workflowGroups);
    });

    state.setLinkSelections(link, linkHover, linkGroup);
}

function showEdgeTooltip(d: any, event: any): void {
    const tooltip = document.getElementById('edgeTooltip');
    if (!tooltip) return;

    tooltip.innerHTML =
        `<div><strong>Variable:</strong> ${d.label || 'N/A'}</div>` +
        (d.dataType ? `<div><strong>Type:</strong> ${d.dataType}</div>` : '') +
        (d.description ? `<div><strong>Description:</strong> ${d.description}</div>` : '') +
        (d.sourceLocation ? `<div><strong>Location:</strong> ${d.sourceLocation.file.split('/').pop()}:${d.sourceLocation.line}</div>` : '');

    tooltip.style.display = 'block';
    updateTooltipPosition(event);
}

function updateTooltipPosition(event: any): void {
    const tooltip = document.getElementById('edgeTooltip');
    if (!tooltip) return;

    // Position tooltip near mouse cursor
    const mouseX = event.clientX || event.pageX;
    const mouseY = event.clientY || event.pageY;

    tooltip.style.left = `${mouseX + 15}px`;
    tooltip.style.top = `${mouseY - 10}px`;
}

export function updateEdgePaths(): void {
    const { link, linkHover, currentGraphData, workflowGroups } = state;

    const getNode = (nodeId: string) => getNodeOrCollapsedGroup(nodeId, currentGraphData.nodes, workflowGroups);

    link.attr('d', function(l: any) {
        const sourceNode = getNode(l.source);
        const targetNode = getNode(l.target);
        const targetWidth = targetNode?.isCollapsedGroup ? 260 : 140;
        const targetHeight = targetNode?.isCollapsedGroup ? 130 : 70;
        return generateEdgePath(l, sourceNode, targetNode, workflowGroups, targetWidth, targetHeight);
    });

    linkHover.attr('d', function(l: any) {
        const sourceNode = getNode(l.source);
        const targetNode = getNode(l.target);
        const targetWidth = targetNode?.isCollapsedGroup ? 260 : 140;
        const targetHeight = targetNode?.isCollapsedGroup ? 130 : 70;
        return generateEdgePath(l, sourceNode, targetNode, workflowGroups, targetWidth, targetHeight);
    });
}
