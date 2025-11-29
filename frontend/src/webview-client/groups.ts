// Workflow group rendering (expanded and collapsed)
import * as state from './state';
import {
    COLLAPSED_GROUP_WIDTH, COLLAPSED_GROUP_HEIGHT,
    COLLAPSED_GROUP_HALF_WIDTH, COLLAPSED_GROUP_HALF_HEIGHT,
    COLLAPSED_GROUP_BORDER_RADIUS,
    GROUP_TITLE_OFFSET_X, GROUP_TITLE_OFFSET_Y,
    GROUP_COLLAPSE_BTN_X, GROUP_COLLAPSE_BTN_Y, GROUP_COLLAPSE_BTN_SIZE,
    GROUP_STROKE_WIDTH
} from './constants';

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
        .attr('rx', COLLAPSED_GROUP_BORDER_RADIUS)
        .style('fill', (d: any) => d.color)
        .style('fill-opacity', 0.1)
        .style('stroke', (d: any) => d.color)
        .style('stroke-width', `${GROUP_STROKE_WIDTH}px`)
        .style('stroke-dasharray', '8,4')
        .style('opacity', (d: any) => (d.collapsed || d.id === 'group_orphans') ? 0 : 1)
        .style('pointer-events', 'none');

    // Title inside expanded group
    groupElements.append('text')
        .attr('class', 'group-title-expanded')
        .attr('x', (d: any) => d.bounds.minX + GROUP_TITLE_OFFSET_X)
        .attr('y', (d: any) => d.bounds.minY + GROUP_TITLE_OFFSET_Y)
        .attr('dominant-baseline', 'middle')
        .style('fill', (d: any) => d.color)
        .style('font-family', '"Inter", "Segoe UI", "SF Pro Display", -apple-system, sans-serif')
        .style('font-size', '17px')
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
        .attr('x', (d: any) => d.bounds.minX + GROUP_COLLAPSE_BTN_X)
        .attr('y', (d: any) => d.bounds.minY + GROUP_COLLAPSE_BTN_Y)
        .attr('width', GROUP_COLLAPSE_BTN_SIZE)
        .attr('height', GROUP_COLLAPSE_BTN_SIZE)
        .attr('rx', 4)
        .style('fill', (d: any) => d.color)
        .style('fill-opacity', 0.2)
        .style('stroke', (d: any) => d.color)
        .style('stroke-width', '2px');

    expandedCollapseBtn.append('text')
        .attr('x', (d: any) => d.bounds.minX + GROUP_COLLAPSE_BTN_X + GROUP_COLLAPSE_BTN_SIZE / 2)
        .attr('y', (d: any) => d.bounds.minY + GROUP_TITLE_OFFSET_Y)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
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
        .attr('class', 'collapsed-bg-pattern')
        .attr('x', (d: any) => d.centerX - COLLAPSED_GROUP_HALF_WIDTH)
        .attr('y', (d: any) => d.centerY - COLLAPSED_GROUP_HALF_HEIGHT)
        .attr('width', COLLAPSED_GROUP_WIDTH)
        .attr('height', COLLAPSED_GROUP_HEIGHT)
        .attr('rx', COLLAPSED_GROUP_BORDER_RADIUS)
        .style('fill', (d: any) => `url(#pegboard-${d.id})`)
        .style('stroke', (d: any) => d.color)
        .style('stroke-width', `${GROUP_STROKE_WIDTH}px`)
        .style('filter', 'drop-shadow(0 2px 8px rgba(0,0,0,0.2))');

    // Solid color overlay
    collapsedGroups.append('rect')
        .attr('class', 'collapsed-bg-overlay')
        .attr('x', (d: any) => d.centerX - COLLAPSED_GROUP_HALF_WIDTH)
        .attr('y', (d: any) => d.centerY - COLLAPSED_GROUP_HALF_HEIGHT)
        .attr('width', COLLAPSED_GROUP_WIDTH)
        .attr('height', COLLAPSED_GROUP_HEIGHT)
        .attr('rx', COLLAPSED_GROUP_BORDER_RADIUS)
        .style('fill', (d: any) => d.color)
        .style('fill-opacity', 0.7)
        .style('pointer-events', 'none');

    // Single foreignObject for all text content with flexbox layout
    const contentFO = collapsedGroups.append('foreignObject')
        .attr('class', 'collapsed-content')
        .attr('x', (d: any) => d.centerX - COLLAPSED_GROUP_HALF_WIDTH)
        .attr('y', (d: any) => d.centerY - COLLAPSED_GROUP_HALF_HEIGHT)
        .attr('width', COLLAPSED_GROUP_WIDTH)
        .attr('height', COLLAPSED_GROUP_HEIGHT);

    const contentDiv = contentFO.append('xhtml:div')
        .style('width', '100%')
        .style('height', '100%')
        .style('display', 'flex')
        .style('flex-direction', 'column')
        .style('align-items', 'center')
        .style('justify-content', 'center')
        .style('padding', '16px 20px')
        .style('box-sizing', 'border-box')
        .style('gap', '8px');

    // Title (with line clamping)
    contentDiv.append('xhtml:div')
        .attr('class', 'collapsed-title')
        .style('display', '-webkit-box')
        .style('-webkit-line-clamp', '3')
        .style('-webkit-box-orient', 'vertical')
        .style('overflow', 'hidden')
        .style('text-overflow', 'ellipsis')
        .style('text-align', 'center')
        .style('color', '#ffffff')
        .style('font-family', '"Inter", "Segoe UI", "SF Pro Display", -apple-system, sans-serif')
        .style('font-size', '19px')
        .style('font-weight', '600')
        .style('line-height', '1.3')
        .style('word-wrap', 'break-word')
        .style('max-width', '220px')
        .text((d: any) => d.name);

    // Stats line
    contentDiv.append('xhtml:div')
        .attr('class', 'collapsed-stats')
        .style('color', '#ffffff')
        .style('opacity', '0.9')
        .style('font-family', '"Inter", "Segoe UI", "SF Pro Display", -apple-system, sans-serif')
        .style('font-size', '15px')
        .style('font-weight', '600')
        .style('text-align', 'center')
        .text((d: any) => `${d.nodes.length} nodes • ${d.llmProvider}`);

    // Expand icon in bottom-right corner
    collapsedGroups.append('text')
        .attr('class', 'collapsed-expand-icon')
        .attr('x', (d: any) => d.centerX + COLLAPSED_GROUP_HALF_WIDTH - 22)
        .attr('y', (d: any) => d.centerY + COLLAPSED_GROUP_HALF_HEIGHT - 14)
        .attr('text-anchor', 'middle')
        .style('fill', '#ffffff')
        .style('opacity', 0.6)
        .style('font-size', '16px')
        .style('pointer-events', 'none')
        .text('⤢');

    state.setCollapsedGroups(collapsedGroups);
    state.setContainers(state.groupContainer, collapsedGroupContainer);
}
