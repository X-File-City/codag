// Shared helper functions for webview

import {
    NODE_WIDTH,
    NODE_HEIGHT,
    COLLAPSED_GROUP_WIDTH,
    COLLAPSED_GROUP_HEIGHT,
    GROUP_BOUNDS_PADDING_X,
    GROUP_BOUNDS_PADDING_TOP,
    GROUP_BOUNDS_PADDING_BOTTOM
} from './constants';
import { measureTextWidth } from './groups';

declare const d3: any;

/**
 * Measure node dimensions based on label text with wrapping
 * Returns width and height that fits the text content
 */
export function measureNodeDimensions(label: string): { width: number; height: number } {
    const fontFamily = '"DM Sans", "Inter", "Segoe UI", -apple-system, sans-serif';
    const fontSize = 15;
    const lineHeight = 20;  // Increased for better spacing
    const horizontalPadding = 16;  // 8px on each side (matches foreignObject x offset)
    const minWidth = 80;
    const maxWidth = 200;
    const verticalPadding = 12;  // 6px on each side

    const textWidth = measureTextWidth(label, `${fontSize}px`, '400', fontFamily);

    // Available text space inside max-width node (foreignObject uses nodeWidth - 8)
    // Add 10% safety buffer for SVG vs CSS measurement differences
    const maxTextSpace = (maxWidth - 8) * 0.90;

    // If text fits in one line within max width (with safety margin)
    if (textWidth <= maxTextSpace) {
        const width = Math.max(minWidth, textWidth + horizontalPadding);
        const height = lineHeight + verticalPadding;
        return { width, height };
    }

    // Calculate number of lines needed using actual available width
    const words = label.split(' ');
    let lines = 1;
    let currentLineWidth = 0;

    for (const word of words) {
        const wordWidth = measureTextWidth(word, `${fontSize}px`, '400', fontFamily);
        const spaceWidth = measureTextWidth(' ', `${fontSize}px`, '400', fontFamily);

        // Check if word fits on current line (with space if not first word on line)
        const neededWidth = currentLineWidth > 0 ? wordWidth + spaceWidth : wordWidth;

        if (currentLineWidth + neededWidth > maxTextSpace && currentLineWidth > 0) {
            lines++;
            currentLineWidth = wordWidth;
        } else {
            currentLineWidth += neededWidth;
        }
    }

    const height = (lines * lineHeight) + verticalPadding;
    return { width: maxWidth, height };
}

/**
 * Measure node width based on label text (legacy - use measureNodeDimensions)
 */
export function measureNodeWidth(label: string): number {
    return measureNodeDimensions(label).width;
}

/**
 * Get node dimensions based on whether it's a collapsed group or regular node
 * Replaces 17+ occurrences of inline dimension calculation
 */
export function getNodeDimensions(node: any): { width: number; height: number } {
    if (node?.isCollapsedGroup) {
        return { width: COLLAPSED_GROUP_WIDTH, height: COLLAPSED_GROUP_HEIGHT };
    }
    // Use stored dynamic dimensions if available
    return {
        width: node?.width || NODE_WIDTH,
        height: node?.height || NODE_HEIGHT
    };
}

/**
 * Calculate group bounds from node positions
 * Uses node CENTERS + max dimensions for consistent alignment across workflows
 * This ensures bounding boxes align when dagre-aligned node centers are at the same position
 */
export function calculateGroupBounds(nodes: any[]): {
    bounds: { minX: number; maxX: number; minY: number; maxY: number };
    centerX: number;
    centerY: number;
} | null {
    const validNodes = nodes.filter((n: any) =>
        n.x !== undefined && !isNaN(n.x) && n.y !== undefined && !isNaN(n.y)
    );

    if (validNodes.length === 0) return null;

    // Calculate bounds using actual node edges (tight fit)
    const bounds = {
        minX: Math.min(...validNodes.map((n: any) => n.x - (n.width || NODE_WIDTH) / 2)) - GROUP_BOUNDS_PADDING_X,
        maxX: Math.max(...validNodes.map((n: any) => n.x + (n.width || NODE_WIDTH) / 2)) + GROUP_BOUNDS_PADDING_X,
        minY: Math.min(...validNodes.map((n: any) => n.y - (n.height || NODE_HEIGHT) / 2)) - GROUP_BOUNDS_PADDING_TOP,
        maxY: Math.max(...validNodes.map((n: any) => n.y + (n.height || NODE_HEIGHT) / 2)) + GROUP_BOUNDS_PADDING_BOTTOM
    };

    return {
        bounds,
        centerX: (bounds.minX + bounds.maxX) / 2,
        centerY: (bounds.minY + bounds.maxY) / 2
    };
}

/**
 * Check if two nodes are in the same collapsed group
 * Replaces 4+ occurrences of collapsed group check
 */
export function areNodesInSameCollapsedGroup(
    sourceId: string,
    targetId: string,
    workflowGroups: any[]
): boolean {
    // Extract original IDs if these are virtual node IDs (nodeId__workflowId)
    const getOriginalId = (id: string) => id.includes('__') ? id.split('__')[0] : id;
    const origSource = getOriginalId(sourceId);
    const origTarget = getOriginalId(targetId);

    const sourceGroup = workflowGroups.find((g: any) => g.collapsed && g.nodes.includes(origSource));
    const targetGroup = workflowGroups.find((g: any) => g.collapsed && g.nodes.includes(origTarget));
    return !!(sourceGroup && targetGroup && sourceGroup.id === targetGroup.id);
}

/**
 * Get filtered node IDs from workflow groups (only groups with 3+ nodes)
 * Replaces 3 occurrences of workflow node filtering
 */
export function getWorkflowNodeIds(workflowGroups: any[]): Set<string> {
    const ids = new Set<string>();
    workflowGroups.forEach((g: any) => {
        if (g.nodes.length >= 3) {
            g.nodes.forEach((id: string) => ids.add(id));
        }
    });
    return ids;
}

/**
 * Find the reverse edge (B→A) for a given edge (A→B)
 */
export function findReverseEdge(edge: any, allEdges: any[]): any | null {
    return allEdges.find((e: any) => e.source === edge.target && e.target === edge.source) || null;
}

/**
 * Check if an edge is bidirectional (has a reverse edge)
 */
export function isBidirectionalEdge(edge: any, allEdges: any[]): boolean {
    return allEdges.some((e: any) => e.source === edge.target && e.target === edge.source);
}

/**
 * Get canonical edge key for bidirectional edges (always uses alphabetically first node as source)
 * This ensures A→B and B→A map to the same key
 */
export function getBidirectionalEdgeKey(edge: any): string {
    const [first, second] = [edge.source, edge.target].sort();
    return `${first}<->${second}`;
}

/**
 * Position a tooltip near the mouse cursor with boundary checks
 */
export function positionTooltipNearMouse(
    tooltip: HTMLElement,
    mouseX: number,
    mouseY: number,
    offsetX: number = 15,
    offsetY: number = 10
): void {
    // Temporarily make visible to measure
    tooltip.style.opacity = '0';
    tooltip.style.display = 'block';
    const tooltipRect = tooltip.getBoundingClientRect();
    tooltip.style.opacity = '';
    tooltip.style.display = '';

    let left = mouseX + offsetX;
    let top = mouseY - offsetY;

    // Boundary checks
    if (left + tooltipRect.width > window.innerWidth) {
        left = mouseX - tooltipRect.width - offsetX;
    }
    if (left < 0) left = offsetX;
    if (top < 0) top = mouseY + offsetX;
    if (top + tooltipRect.height > window.innerHeight) {
        top = window.innerHeight - tooltipRect.height - offsetX;
    }

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}
