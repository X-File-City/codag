// Group visibility management
import * as state from './state';
import { generateEdgePath, getNodeOrCollapsedGroup } from './utils';

declare const d3: any;

export function updateGroupVisibility(): void {
    const {
        groupElements,
        collapsedGroups,
        node,
        linkGroup,
        link,
        linkHover,
        workflowGroups,
        currentGraphData,
        vscode
    } = state;

    // Update Level 1 group backgrounds
    groupElements.select('.group-background')
        .style('opacity', (d: any) => d.collapsed ? 0 : 1);

    // Update Level 1 expanded title
    groupElements.select('.group-title-expanded')
        .style('display', (d: any) => d.collapsed ? 'none' : 'block');

    // Update Level 1 collapse button
    groupElements.select('.group-collapse-btn')
        .style('display', (d: any) => d.collapsed ? 'none' : 'block');

    // Show/hide collapsed groups
    collapsedGroups.style('display', (d: any) => d.collapsed ? 'block' : 'none');

    // Hide nodes that are in collapsed groups
    node.style('display', (d: any) => {
        const inCollapsedGroup = workflowGroups.some((g: any) => g.collapsed && g.nodes.includes(d.id));
        return inCollapsedGroup ? 'none' : 'block';
    });

    // Show all edges, but route them to collapsed groups when needed
    linkGroup.style('display', 'block');

    // Update edge paths to route to collapsed groups
    const getNode = (nodeId: string) => getNodeOrCollapsedGroup(nodeId, currentGraphData.nodes, workflowGroups);

    link.attr('d', function(this: SVGPathElement, l: any) {
        const sourceNode = getNode(l.source);
        const targetNode = getNode(l.target);

        // Skip if nodes not found
        if (!sourceNode || !targetNode) return '';

        // Check if both nodes are in the same collapsed group
        const sourceGroup = workflowGroups.find((g: any) => g.collapsed && g.nodes.includes(l.source));
        const targetGroup = workflowGroups.find((g: any) => g.collapsed && g.nodes.includes(l.target));
        if (sourceGroup && targetGroup && sourceGroup.id === targetGroup.id) {
            // Internal edge - hide it
            d3.select(this.parentNode).style('display', 'none');
            return '';
        }

        // Edge crosses group boundaries - show it
        d3.select(this.parentNode).style('display', 'block');

        const targetWidth = targetNode.isCollapsedGroup ? 260 : 140;
        const targetHeight = targetNode.isCollapsedGroup ? 130 : 70;

        return generateEdgePath(l, sourceNode, targetNode, workflowGroups, targetWidth, targetHeight);
    });

    linkHover.attr('d', function(this: SVGPathElement, l: any) {
        const sourceNode = getNode(l.source);
        const targetNode = getNode(l.target);

        if (!sourceNode || !targetNode) return '';

        // Check if both nodes are in the same collapsed group
        const sourceGroup = workflowGroups.find((g: any) => g.collapsed && g.nodes.includes(l.source));
        const targetGroup = workflowGroups.find((g: any) => g.collapsed && g.nodes.includes(l.target));
        if (sourceGroup && targetGroup && sourceGroup.id === targetGroup.id) {
            return '';
        }

        const targetWidth = targetNode.isCollapsedGroup ? 260 : 140;
        const targetHeight = targetNode.isCollapsedGroup ? 130 : 70;

        return generateEdgePath(l, sourceNode, targetNode, workflowGroups, targetWidth, targetHeight);
    });

    // Notify extension of workflow visibility state
    const expandedWorkflowIds = workflowGroups
        .filter((g: any) => !g.collapsed && g.id !== 'group_orphans')
        .map((g: any) => g.name);

    vscode.postMessage({
        command: 'workflowVisibilityChanged',
        expandedWorkflowIds: expandedWorkflowIds
    });
}
