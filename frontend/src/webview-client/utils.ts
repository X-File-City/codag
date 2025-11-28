// Utility functions for webview client

export const GRID_SIZE = 5; // 5px grid for precise alignment

/**
 * Snap value to nearest grid point
 */
export function snapToGrid(value: number): number {
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

/**
 * Calculate intersection point at rectangle boundary
 */
export function intersectRect(
    sourceNode: { x: number; y: number },
    targetNode: { x: number; y: number },
    nodeWidth: number = 50,
    nodeHeight: number = 50
): { x: number; y: number } {
    const dx = sourceNode.x - targetNode.x;
    const dy = sourceNode.y - targetNode.y;
    const halfWidth = nodeWidth / 2;
    const halfHeight = nodeHeight / 2;

    // Determine which edge is hit first (top/bottom vs left/right)
    if (Math.abs(dy / dx) > halfHeight / halfWidth) {
        // Hits top or bottom edge
        return {
            x: targetNode.x + dx * Math.abs(halfHeight / dy),
            y: targetNode.y + halfHeight * Math.sign(dy)
        };
    } else {
        // Hits left or right edge
        return {
            x: targetNode.x + halfWidth * Math.sign(dx),
            y: targetNode.y + dy * Math.abs(halfWidth / dx)
        };
    }
}

/**
 * Generate unique color from string hash using HSL
 */
export function colorFromString(str: string, saturation: number = 70, lightness: number = 60): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Get node or collapsed group representation for edge routing
 */
export function getNodeOrCollapsedGroup(nodeId: string, nodes: any[], workflowGroups: any[]): any {
    // Check for collapsed workflow group
    const collapsedGroup = workflowGroups.find((g: any) =>
        g.collapsed && g.nodes.includes(nodeId)
    );

    if (collapsedGroup) {
        return {
            id: collapsedGroup.id,
            x: collapsedGroup.centerX,
            y: collapsedGroup.centerY,
            isCollapsedGroup: true,
            width: 260,
            height: 130
        };
    }

    return nodes.find((n: any) => n.id === nodeId);
}

/**
 * Helper function to count how many workflows contain a node
 */
export function getNodeWorkflowCount(nodeId: string, workflowGroups: any[]): number {
    return workflowGroups.filter((g: any) => g.nodes.includes(nodeId)).length;
}

/**
 * Helper function to check if node is in a specific workflow
 */
export function isNodeInWorkflow(nodeId: string, workflowId: string, workflowGroups: any[]): boolean {
    const workflow = workflowGroups.find((g: any) => g.id === workflowId);
    return workflow ? workflow.nodes.includes(nodeId) : false;
}

/**
 * Generate curved path for cross-workflow edges
 */
export function generateEdgePath(
    edge: any,
    sourceNode: any,
    targetNode: any,
    workflowGroups: any[],
    targetWidth: number = 140,
    targetHeight: number = 70
): string {
    // Validate nodes exist and have valid coordinates
    if (!sourceNode || !targetNode ||
        typeof sourceNode.x !== 'number' || typeof sourceNode.y !== 'number' ||
        typeof targetNode.x !== 'number' || typeof targetNode.y !== 'number' ||
        isNaN(sourceNode.x) || isNaN(sourceNode.y) ||
        isNaN(targetNode.x) || isNaN(targetNode.y)) {
        console.warn(`Invalid edge coordinates for ${edge.source} -> ${edge.target}`);
        return '';
    }

    // Check if this is a cross-workflow edge
    const sourceGroup = workflowGroups.find((g: any) => g.nodes.includes(edge.source));
    const targetGroup = workflowGroups.find((g: any) => g.nodes.includes(edge.target));
    const isCrossWorkflow = sourceGroup && targetGroup && sourceGroup.id !== targetGroup.id;

    const intersection = intersectRect(sourceNode, targetNode, targetWidth, targetHeight);

    if (isCrossWorkflow) {
        // Generate smooth quadratic Bezier curve for cross-workflow edges
        const midY = (sourceNode.y + intersection.y) / 2;
        // Control point at vertical midpoint to create smooth curve
        return `M${sourceNode.x},${sourceNode.y} Q${sourceNode.x},${midY} ${intersection.x},${intersection.y}`;
    } else {
        // Straight line for within-workflow edges
        return `M${sourceNode.x},${sourceNode.y} L${intersection.x},${intersection.y}`;
    }
}
