// Workflow group rendering (expanded and collapsed)
import * as state from './state';

declare const d3: any;

export function renderGroups(updateGroupVisibility: () => void): void {
    const { g, workflowGroups } = state;

    // Render group containers
    const groupContainer = g.append('g').attr('class', 'groups');
    state.setContainers(groupContainer, null);

    // Filter out groups without bounds and workflows with < 3 nodes
    const groupsWithBounds = workflowGroups.filter((grp: any) => grp.bounds && grp.nodes.length >= 3);

    const groupElements = groupContainer.selectAll('.workflow-group')
        .data(groupsWithBounds, (d: any) => d.id)
        .enter()
        .append('g')
        .attr('class', 'workflow-group')
        .attr('data-group-id', (d: any) => d.id);

    // Group background rectangle
    groupElements.append('rect')
        .attr('class', 'group-background')
        .attr('x', (d: any) => d.bounds.minX)
        .attr('y', (d: any) => d.bounds.minY)
        .attr('width', (d: any) => d.bounds.maxX - d.bounds.minX)
        .attr('height', (d: any) => d.bounds.maxY - d.bounds.minY)
        .attr('rx', 12)
        .style('fill', (d: any) => d.color)
        .style('fill-opacity', 0.1)
        .style('stroke', (d: any) => d.color)
        .style('stroke-width', '3px')
        .style('stroke-dasharray', '8,4')
        .style('opacity', (d: any) => (d.collapsed || d.id === 'group_orphans') ? 0 : 1)
        .style('pointer-events', 'none');

    // Title inside expanded group
    groupElements.append('text')
        .attr('class', 'group-title-expanded')
        .attr('x', (d: any) => d.bounds.minX + 40)
        .attr('y', (d: any) => d.bounds.minY + 24)
        .style('fill', (d: any) => d.color)
        .style('font-size', '13px')
        .style('font-weight', '700')
        .style('display', (d: any) => (d.collapsed || d.id === 'group_orphans') ? 'none' : 'block')
        .style('pointer-events', 'none')
        .text((d: any) => `${d.name} (${d.nodes.length} nodes)`);

    // Collapse button for expanded group
    const expandedCollapseBtn = groupElements.append('g')
        .attr('class', 'group-collapse-btn')
        .style('display', (d: any) => (d.collapsed || d.id === 'group_orphans') ? 'none' : 'block')
        .style('cursor', 'pointer')
        .on('click', function(event: any, d: any) {
            event.stopPropagation();
            d.collapsed = true;
            updateGroupVisibility();
        });

    expandedCollapseBtn.append('rect')
        .attr('x', (d: any) => d.bounds.minX + 10)
        .attr('y', (d: any) => d.bounds.minY + 8)
        .attr('width', 24)
        .attr('height', 24)
        .attr('rx', 4)
        .style('fill', (d: any) => d.color)
        .style('fill-opacity', 0.2)
        .style('stroke', (d: any) => d.color)
        .style('stroke-width', '2px');

    expandedCollapseBtn.append('text')
        .attr('x', (d: any) => d.bounds.minX + 22)
        .attr('y', (d: any) => d.bounds.minY + 24)
        .attr('text-anchor', 'middle')
        .style('fill', (d: any) => d.color)
        .style('font-size', '16px')
        .style('font-weight', 'bold')
        .style('pointer-events', 'none')
        .text('−');

    state.setGroupElements(groupElements);
}

export function renderCollapsedGroups(updateGroupVisibility: () => void): void {
    const { g, workflowGroups } = state;

    const groupsWithBounds = workflowGroups.filter((grp: any) => grp.bounds && grp.nodes.length >= 3);

    // Render collapsed groups AFTER edges/nodes for proper z-index
    const collapsedGroupContainer = g.append('g').attr('class', 'collapsed-groups');

    const collapsedGroups = collapsedGroupContainer.selectAll('.collapsed-group')
        .data(groupsWithBounds, (d: any) => d.id)
        .enter()
        .append('g')
        .attr('class', 'collapsed-group-node')
        .attr('data-group-id', (d: any) => d.id)
        .style('display', (d: any) => d.collapsed ? 'block' : 'none')
        .style('cursor', 'pointer')
        .on('click', function(event: any, d: any) {
            event.stopPropagation();
            d.collapsed = false;
            updateGroupVisibility();
        });

    // Background with pegboard pattern
    collapsedGroups.append('rect')
        .attr('x', (d: any) => d.centerX - 130)
        .attr('y', (d: any) => d.centerY - 65)
        .attr('width', 260)
        .attr('height', 130)
        .attr('rx', 12)
        .style('fill', (d: any) => `url(#pegboard-${d.id})`)
        .style('stroke', (d: any) => d.color)
        .style('stroke-width', '3px')
        .style('filter', 'drop-shadow(0 2px 8px rgba(0,0,0,0.2))');

    // Solid color overlay
    collapsedGroups.append('rect')
        .attr('x', (d: any) => d.centerX - 130)
        .attr('y', (d: any) => d.centerY - 65)
        .attr('width', 260)
        .attr('height', 130)
        .attr('rx', 12)
        .style('fill', (d: any) => d.color)
        .style('fill-opacity', 0.7)
        .style('pointer-events', 'none');

    // Title text
    collapsedGroups.append('text')
        .attr('x', (d: any) => d.centerX)
        .attr('y', (d: any) => d.centerY - 20)
        .attr('text-anchor', 'middle')
        .style('fill', '#ffffff')
        .style('font-size', '15px')
        .style('font-weight', '700')
        .text((d: any) => d.name)
        .each(function(this: SVGTextElement) {
            const maxWidth = 240;
            let textLength = this.getComputedTextLength();
            if (textLength > maxWidth) {
                const scale = maxWidth / textLength;
                const newFontSize = Math.max(10, 15 * scale);
                d3.select(this).style('font-size', `${newFontSize}px`);
            }
        });

    // Node count text
    collapsedGroups.append('text')
        .attr('x', (d: any) => d.centerX)
        .attr('y', (d: any) => d.centerY + 5)
        .attr('text-anchor', 'middle')
        .style('fill', '#ffffff')
        .style('opacity', 0.9)
        .style('font-size', '12px')
        .text((d: any) => `${d.nodes.length} nodes • ${d.llmProvider}`);

    // Expand prompt
    collapsedGroups.append('text')
        .attr('x', (d: any) => d.centerX)
        .attr('y', (d: any) => d.centerY + 30)
        .attr('text-anchor', 'middle')
        .style('fill', '#ffffff')
        .style('opacity', 0.7)
        .style('font-size', '12px')
        .text('Click to expand ▼');

    state.setCollapsedGroups(collapsedGroups);
    state.setContainers(state.groupContainer, collapsedGroupContainer);
}
