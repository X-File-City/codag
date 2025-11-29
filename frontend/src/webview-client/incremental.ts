// Incremental graph updates - viewport state management
import * as state from './state';
import { SavedState } from './types';
import { openPanel, closePanel } from './panel';
import { updateMinimapViewport } from './minimap';
import { updateGroupVisibility } from './visibility';

declare const d3: any;

export function captureState(): SavedState {
    const { svg, workflowGroups, currentGraphData, currentlyOpenNodeId } = state;
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
