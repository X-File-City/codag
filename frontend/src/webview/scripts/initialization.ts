/**
 * Initialization script for webview
 * Sets up VSCode API and global variables
 */

export function getInitializationScript(graphJson: string): string {
    return `        const vscode = acquireVsCodeApi();
        let currentGraphData = ${graphJson};

        // Update header snapshot stats (only count visible workflows/nodes)
        function updateSnapshotStats() {
            // Only count workflows and nodes that are actually visible (in workflowGroups)
            const visibleWorkflowCount = typeof workflowGroups !== 'undefined' ? workflowGroups.length : 0;

            // Get all visible node IDs from workflowGroups
            const visibleNodeIds = new Set();
            if (typeof workflowGroups !== 'undefined') {
                workflowGroups.forEach(wf => wf.nodes.forEach(id => visibleNodeIds.add(id)));
            }

            // Count only LLM nodes that are in visible workflows
            const nodes = currentGraphData.nodes || [];
            const visibleLlmCalls = nodes.filter(n => n.type === 'llm' && visibleNodeIds.has(n.id)).length;

            document.getElementById('statWorkflows').textContent = visibleWorkflowCount;
            document.getElementById('statLlmCalls').textContent = visibleLlmCalls;

            const now = new Date();
            const hours = now.getHours();
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            const hour12 = hours % 12 || 12;
            document.getElementById('statTimestamp').textContent = hour12 + ':' + minutes + ' ' + ampm;
        }`;
}
