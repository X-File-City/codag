/**
 * Graph diffing logic for incremental updates
 * Computes differences between old and new graph states
 */

export const graphDiffScript = `
        // Graph diffing for incremental updates
        function computeGraphDiff(oldGraph, newGraph) {
            const diff = {
                nodes: { added: [], removed: [], updated: [] },
                edges: { added: [], removed: [], updated: [] },
                workflows: { added: [], removed: [], updated: [] }
            };

            // Build lookup maps
            const oldNodeMap = new Map(oldGraph.nodes.map(n => [n.id, n]));
            const newNodeMap = new Map(newGraph.nodes.map(n => [n.id, n]));

            const oldEdgeKey = e => e.source + '->' + e.target;
            const oldEdgeMap = new Map(oldGraph.edges.map(e => [oldEdgeKey(e), e]));
            const newEdgeMap = new Map(newGraph.edges.map(e => [oldEdgeKey(e), e]));

            const oldWorkflowMap = new Map((oldGraph.workflows || []).map(w => [w.id, w]));
            const newWorkflowMap = new Map((newGraph.workflows || []).map(w => [w.id, w]));

            // Diff nodes
            newGraph.nodes.forEach(newNode => {
                const oldNode = oldNodeMap.get(newNode.id);
                if (!oldNode) {
                    diff.nodes.added.push(newNode);
                } else if (nodeChanged(oldNode, newNode)) {
                    diff.nodes.updated.push(newNode);
                }
            });

            oldGraph.nodes.forEach(oldNode => {
                if (!newNodeMap.has(oldNode.id)) {
                    diff.nodes.removed.push(oldNode.id);
                }
            });

            // Diff edges
            newGraph.edges.forEach(newEdge => {
                const key = oldEdgeKey(newEdge);
                const oldEdge = oldEdgeMap.get(key);
                if (!oldEdge) {
                    diff.edges.added.push(newEdge);
                } else if (edgeChanged(oldEdge, newEdge)) {
                    diff.edges.updated.push(newEdge);
                }
            });

            oldGraph.edges.forEach(oldEdge => {
                const key = oldEdgeKey(oldEdge);
                if (!newEdgeMap.has(key)) {
                    diff.edges.removed.push({ source: oldEdge.source, target: oldEdge.target });
                }
            });

            // Diff workflows
            (newGraph.workflows || []).forEach(newWorkflow => {
                const oldWorkflow = oldWorkflowMap.get(newWorkflow.id);
                if (!oldWorkflow) {
                    diff.workflows.added.push(newWorkflow);
                } else if (workflowChanged(oldWorkflow, newWorkflow)) {
                    diff.workflows.updated.push(newWorkflow);
                }
            });

            (oldGraph.workflows || []).forEach(oldWorkflow => {
                if (!newWorkflowMap.has(oldWorkflow.id)) {
                    diff.workflows.removed.push(oldWorkflow.id);
                }
            });

            return diff;
        }

        function nodeChanged(oldNode, newNode) {
            return oldNode.label !== newNode.label ||
                   oldNode.type !== newNode.type ||
                   oldNode.description !== newNode.description ||
                   oldNode.isEntryPoint !== newNode.isEntryPoint ||
                   oldNode.isExitPoint !== newNode.isExitPoint ||
                   oldNode.isCriticalPath !== newNode.isCriticalPath ||
                   JSON.stringify(oldNode.source) !== JSON.stringify(newNode.source);
        }

        function edgeChanged(oldEdge, newEdge) {
            return oldEdge.label !== newEdge.label ||
                   oldEdge.isCriticalPath !== newEdge.isCriticalPath;
        }

        function workflowChanged(oldWorkflow, newWorkflow) {
            return oldWorkflow.name !== newWorkflow.name ||
                   oldWorkflow.description !== newWorkflow.description ||
                   JSON.stringify(oldWorkflow.nodeIds.sort()) !== JSON.stringify(newWorkflow.nodeIds.sort());
        }

        function hasDiff(diff) {
            return diff.nodes.added.length > 0 ||
                   diff.nodes.removed.length > 0 ||
                   diff.nodes.updated.length > 0 ||
                   diff.edges.added.length > 0 ||
                   diff.edges.removed.length > 0 ||
                   diff.edges.updated.length > 0 ||
                   diff.workflows.added.length > 0 ||
                   diff.workflows.removed.length > 0 ||
                   diff.workflows.updated.length > 0;
        }
`;
