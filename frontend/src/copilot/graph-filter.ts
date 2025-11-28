/**
 * Graph filtering utilities for removing orphaned nodes
 * Applies the same filtering logic used in webview rendering to Copilot context
 */

import { WorkflowGraph, WorkflowMetadata } from '../api';

/**
 * Filters out orphaned nodes and their edges from the graph
 * For Copilot: Less aggressive than webview - includes all nodes connected to LLM nodes
 * regardless of component size, so small workflows still show up
 */
export function filterOrphanedNodes(graph: WorkflowGraph): WorkflowGraph {
    // Return empty graph if no nodes
    if (!graph.nodes || graph.nodes.length === 0) {
        return { ...graph, nodes: [], edges: [] };
    }

    // If graph is small (< 10 nodes), don't filter - show everything
    if (graph.nodes.length < 10) {
        return graph;
    }

    // Build adjacency maps for connectivity analysis
    const incomingEdges = new Map<string, string[]>();
    const outgoingEdges = new Map<string, string[]>();

    graph.nodes.forEach(n => {
        incomingEdges.set(n.id, []);
        outgoingEdges.set(n.id, []);
    });

    graph.edges.forEach(e => {
        const incoming = incomingEdges.get(e.target);
        const outgoing = outgoingEdges.get(e.source);
        if (incoming) incoming.push(e.source);
        if (outgoing) outgoing.push(e.target);
    });

    // Find all connected components using BFS
    const visited = new Set<string>();
    const validNodeIds = new Set<string>();
    const llmNodes = graph.nodes.filter(n => n.type === 'llm');

    // If no LLM nodes, return all nodes (user may be looking at non-LLM workflows)
    if (llmNodes.length === 0) {
        return graph;
    }

    // Start BFS from each unvisited LLM node
    llmNodes.forEach(llmNode => {
        if (visited.has(llmNode.id)) return;

        // BFS to find entire connected component
        const component = new Set<string>();
        const queue = [llmNode.id];
        const queueVisited = new Set([llmNode.id]);

        while (queue.length > 0) {
            const currentId = queue.shift()!;
            component.add(currentId);
            visited.add(currentId);

            // Traverse backward through incoming edges
            const incoming = incomingEdges.get(currentId) || [];
            for (const sourceId of incoming) {
                if (!queueVisited.has(sourceId)) {
                    queue.push(sourceId);
                    queueVisited.add(sourceId);
                }
            }

            // Traverse forward through outgoing edges
            const outgoing = outgoingEdges.get(currentId) || [];
            for (const targetId of outgoing) {
                if (!queueVisited.has(targetId)) {
                    queue.push(targetId);
                    queueVisited.add(targetId);
                }
            }
        }

        // Include ALL components connected to LLM nodes (removed 3+ requirement)
        component.forEach(id => validNodeIds.add(id));
    });

    // Filter nodes to only those in valid workflow groups
    const filteredNodes = graph.nodes.filter(n => validNodeIds.has(n.id));

    // Filter edges to only those where BOTH source AND target are in valid nodes
    const filteredEdges = graph.edges.filter(e =>
        validNodeIds.has(e.source) && validNodeIds.has(e.target)
    );

    // Return filtered graph with same structure
    return {
        ...graph,
        nodes: filteredNodes,
        edges: filteredEdges
    };
}

/**
 * Filters workflows to only those visible in the visualization
 * A workflow is visible if it contains at least one node that survived filterOrphanedNodes
 * This ensures copilot context and webview use identical workflow filtering
 *
 * @param graph - Graph after filterOrphanedNodes has been applied
 * @returns Filtered array of workflows that are actually visible
 */
export function filterVisibleWorkflows(graph: WorkflowGraph): WorkflowMetadata[] {
    if (!graph.workflows || graph.workflows.length === 0) {
        return [];
    }

    // Build set of visible node IDs (nodes that survived filterOrphanedNodes)
    const visibleNodeIds = new Set(graph.nodes.map(n => n.id));

    // Only include workflows that have at least one visible node
    return graph.workflows.filter(wf => {
        if (!wf.nodeIds || wf.nodeIds.length === 0) {
            return false;
        }
        // Keep workflow if ANY of its nodes are still in the filtered graph
        return wf.nodeIds.some(nodeId => visibleNodeIds.has(nodeId));
    });
}
