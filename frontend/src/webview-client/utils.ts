// Utility functions for webview client

import { GRID_SIZE, ARROW_HEAD_LENGTH } from './constants';

/**
 * Snap value to nearest grid point
 * TODO: Debug - grid snapping may cause workflow spacing inconsistencies
 */
export function snapToGrid(value: number): number {
    // Disabled temporarily to debug workflow spacing
    return value;
    // return Math.round(value / GRID_SIZE) * GRID_SIZE;
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
 * Helper function to count how many rendered workflows (3+ nodes) contain a node
 */
export function getNodeWorkflowCount(nodeId: string, workflowGroups: any[]): number {
    return workflowGroups.filter((g: any) =>
        g.nodes.includes(nodeId) && g.nodes.length >= 3
    ).length;
}

/**
 * Helper function to check if node is in a specific workflow
 */
export function isNodeInWorkflow(nodeId: string, workflowId: string, workflowGroups: any[]): boolean {
    const workflow = workflowGroups.find((g: any) => g.id === workflowId);
    return workflow ? workflow.nodes.includes(nodeId) : false;
}

/**
 * Generate virtual ID for a shared node copy (nodeId__workflowId)
 */
export function getVirtualNodeId(nodeId: string, workflowId: string): string {
    return `${nodeId}__${workflowId}`;
}

/**
 * Extract original node ID from virtual ID
 */
export function getOriginalNodeId(virtualId: string): string {
    const parts = virtualId.split('__');
    return parts[0];
}

/**
 * Extract workflow ID from virtual node ID
 */
export function getWorkflowIdFromVirtual(virtualId: string): string | null {
    const parts = virtualId.split('__');
    return parts.length > 1 ? parts[1] : null;
}

/**
 * Check if a node ID is a virtual (duplicated) ID
 */
export function isVirtualNodeId(id: string): boolean {
    return id.includes('__');
}

/**
 * Shorten endpoint along the line by offset amount (for arrow head clearance)
 */
function shortenEndpoint(
    source: { x: number; y: number },
    target: { x: number; y: number },
    offset: number
): { x: number; y: number } {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length === 0 || length <= offset) return target;

    const ratio = (length - offset) / length;
    return {
        x: source.x + dx * ratio,
        y: source.y + dy * ratio
    };
}

/**
 * Determine which edge of a rectangle a point is on
 * Returns direction vector perpendicular to that edge (pointing outward)
 */
function getEdgeDirection(
    point: { x: number; y: number },
    nodeCenter: { x: number; y: number },
    halfWidth: number,
    halfHeight: number
): { x: number; y: number } {
    const dx = point.x - nodeCenter.x;
    const dy = point.y - nodeCenter.y;

    // Check which edge the point is on
    const onLeft = Math.abs(dx + halfWidth) < 1;
    const onRight = Math.abs(dx - halfWidth) < 1;
    const onTop = Math.abs(dy + halfHeight) < 1;
    const onBottom = Math.abs(dy - halfHeight) < 1;

    if (onTop) return { x: 0, y: -1 };
    if (onBottom) return { x: 0, y: 1 };
    if (onLeft) return { x: -1, y: 0 };
    if (onRight) return { x: 1, y: 0 };

    // Fallback: use direction from center
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist > 0 ? { x: dx / dist, y: dy / dist } : { x: 0, y: 1 };
}

/**
 * Generate edge path with cubic bezier curves
 * Control points extend perpendicular to node edges for smooth curves
 */
export function generateEdgePath(
    edge: any,
    sourceNode: any,
    targetNode: any,
    workflowGroups: any[],
    targetWidth: number = 200,
    targetHeight: number = 54,
    sourceWidth: number = 200,
    sourceHeight: number = 54,
    allEdges: any[] = []
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

    // Use dynamic dimensions from node if available
    const srcWidth = sourceNode.width || sourceWidth;
    const srcHeight = sourceNode.height || sourceHeight;
    const tgtWidth = targetNode.width || targetWidth;
    const tgtHeight = targetNode.height || targetHeight;

    // Check if bidirectional (reverse edge exists)
    const isBidirectional = allEdges.some((e: any) => e.source === edge.target && e.target === edge.source);

    // Calculate intersection at source node boundary
    const sourceIntersection = intersectRect(targetNode, sourceNode, srcWidth, srcHeight);

    // Calculate intersection at target node boundary
    const targetIntersection = intersectRect(sourceNode, targetNode, tgtWidth, tgtHeight);

    // Get direction vectors (perpendicular to the edge each point is on)
    const startDir = getEdgeDirection(sourceIntersection, sourceNode, srcWidth / 2, srcHeight / 2);
    const endDir = getEdgeDirection(targetIntersection, targetNode, tgtWidth / 2, tgtHeight / 2);

    // Shorten endpoint along the curve's approach direction
    const startpoint = sourceIntersection;
    const endpoint = {
        x: targetIntersection.x + endDir.x * ARROW_HEAD_LENGTH,
        y: targetIntersection.y + endDir.y * ARROW_HEAD_LENGTH
    };

    // Direction from start to end point (flow)
    const dx = endpoint.x - startpoint.x;
    const dy = endpoint.y - startpoint.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 10) {
        return `M${startpoint.x},${startpoint.y} L${endpoint.x},${endpoint.y}`;
    }

    const flowDirX = dx / dist;
    const flowDirY = dy / dist;

    // Blend perpendicular direction with flow direction
    // This limits curve to 90° max while still exiting/entering perpendicular-ish
    const blendFactor = 0.5; // 0 = pure flow, 1 = pure perpendicular

    // Start control: blend startDir with flowDir
    let ctrl1DirX = startDir.x * blendFactor + flowDirX * (1 - blendFactor);
    let ctrl1DirY = startDir.y * blendFactor + flowDirY * (1 - blendFactor);
    let len1 = Math.sqrt(ctrl1DirX * ctrl1DirX + ctrl1DirY * ctrl1DirY);
    if (len1 > 0) { ctrl1DirX /= len1; ctrl1DirY /= len1; }

    // End control: blend endDir with -flowDir (pointing back)
    let ctrl2DirX = endDir.x * blendFactor + (-flowDirX) * (1 - blendFactor);
    let ctrl2DirY = endDir.y * blendFactor + (-flowDirY) * (1 - blendFactor);
    let len2 = Math.sqrt(ctrl2DirX * ctrl2DirX + ctrl2DirY * ctrl2DirY);
    if (len2 > 0) { ctrl2DirX /= len2; ctrl2DirY /= len2; }

    // Control offset scales with distance
    const ctrlOffset = Math.min(dist * 0.4, 60);

    const ctrl1X = startpoint.x + ctrl1DirX * ctrlOffset;
    const ctrl1Y = startpoint.y + ctrl1DirY * ctrlOffset;
    const ctrl2X = endpoint.x + ctrl2DirX * ctrlOffset;
    const ctrl2Y = endpoint.y + ctrl2DirY * ctrlOffset;

    return `M${startpoint.x},${startpoint.y} C${ctrl1X},${ctrl1Y} ${ctrl2X},${ctrl2Y} ${endpoint.x},${endpoint.y}`;
}
