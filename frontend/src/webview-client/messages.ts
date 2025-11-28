// Message handler for extension communication
import * as state from './state';
import { computeGraphDiff, hasDiff } from './graph-diff';
import { detectWorkflowGroups, updateSnapshotStats } from './workflow-detection';
import { captureState, restoreState, applyIncrementalUpdate } from './incremental';
import { openPanel } from './panel';

declare const d3: any;

export function setupMessageHandler(): void {
    const { svg, zoom } = state;

    window.addEventListener('message', (event: MessageEvent) => {
        const message = event.data;
        const indicator = document.getElementById('loadingIndicator');
        const iconSpan = indicator?.querySelector('.loading-icon') as HTMLElement;
        const textSpan = indicator?.querySelector('.loading-text') as HTMLElement;

        if (!indicator || !iconSpan || !textSpan) return;

        switch (message.command) {
            case 'showLoading':
                indicator.className = 'loading-indicator';
                iconSpan.textContent = '⟳';
                textSpan.textContent = message.text || 'Loading...';
                indicator.style.display = 'block';
                break;

            case 'updateProgress':
                indicator.className = 'loading-indicator';
                iconSpan.textContent = '⟳';
                indicator.style.display = 'block';

                const progressContainer = indicator.querySelector('.progress-bar-container') as HTMLElement;
                const progressFill = indicator.querySelector('.progress-bar-fill') as HTMLElement;
                if (progressContainer && progressFill) {
                    progressContainer.style.display = 'block';
                    const percent = (message.current / message.total) * 100;
                    progressFill.style.width = `${percent}%`;
                    textSpan.textContent = `Analyzing workflows... ${Math.round(percent)}%`;
                }
                break;

            case 'showProgressOverlay':
                const overlay = document.getElementById('progressOverlay');
                const overlayText = overlay?.querySelector('.overlay-text') as HTMLElement;
                if (overlay && overlayText) {
                    overlayText.textContent = message.text || 'Processing...';
                    overlay.style.display = 'flex';
                }
                break;

            case 'hideProgressOverlay':
                const progressOverlay = document.getElementById('progressOverlay');
                if (progressOverlay) progressOverlay.style.display = 'none';
                break;

            case 'analysisStarted':
                indicator.className = 'loading-indicator';
                iconSpan.textContent = '⟳';
                textSpan.textContent = 'Analyzing workflow...';
                indicator.style.display = 'block';
                break;

            case 'analysisComplete':
                if (message.success) {
                    indicator.className = 'loading-indicator success';
                    iconSpan.textContent = '✓';
                    textSpan.textContent = 'Analysis complete';
                    setTimeout(() => {
                        indicator.style.display = 'none';
                    }, 2000);
                } else {
                    indicator.className = 'loading-indicator error';
                    iconSpan.textContent = '✕';
                    textSpan.textContent = message.error || 'Analysis failed';
                    setTimeout(() => {
                        indicator.style.display = 'none';
                    }, 3000);
                }
                break;

            case 'updateGraph':
                if (message.preserveState && message.graph) {
                    console.log('[webview] updateGraph: applying incremental update');

                    // Capture current UI state
                    const savedState = captureState();

                    // Compute diff between old and new graph
                    const diff = computeGraphDiff(state.currentGraphData, message.graph);

                    if (!hasDiff(diff)) {
                        console.log('[webview] updateGraph: no changes detected');
                        break;
                    }

                    // Update the graph data
                    state.setGraphData(message.graph);

                    // Re-detect workflow groups
                    const newWorkflowGroups = detectWorkflowGroups(message.graph);

                    // Merge workflow collapse states from old groups
                    newWorkflowGroups.forEach((newG: any) => {
                        const oldG = state.workflowGroups.find((og: any) => og.id === newG.id);
                        if (oldG) {
                            newG.collapsed = oldG.collapsed;
                            const oldNodes = oldG.nodes.slice().sort();
                            const newNodes = newG.nodes.slice().sort();
                            const nodesChanged = JSON.stringify(oldNodes) !== JSON.stringify(newNodes);
                            if (oldG.bounds && !nodesChanged) {
                                newG.bounds = oldG.bounds;
                                newG.centerX = oldG.centerX;
                                newG.centerY = oldG.centerY;
                            }
                        }
                    });

                    state.setWorkflowGroups(newWorkflowGroups);

                    // Apply incremental DOM updates
                    applyIncrementalUpdate(diff, savedState);

                    // Restore UI state
                    restoreState(savedState);

                    console.log('[webview] updateGraph: incremental update complete', {
                        nodesAdded: diff.nodes.added.length,
                        nodesRemoved: diff.nodes.removed.length,
                        nodesUpdated: diff.nodes.updated.length,
                        edgesAdded: diff.edges.added.length,
                        edgesRemoved: diff.edges.removed.length
                    });

                    // Update header stats
                    updateSnapshotStats(state.workflowGroups, state.currentGraphData);
                } else {
                    console.log('[webview] updateGraph: no graph data or preserveState=false');
                }
                break;

            case 'focusNode':
                if (message.nodeId) {
                    const node = state.currentGraphData.nodes.find((n: any) => n.id === message.nodeId);
                    if (node) {
                        openPanel(node);

                        if (node.x !== undefined && node.y !== undefined) {
                            const svgElement = svg.node();
                            const width = svgElement.clientWidth;
                            const height = svgElement.clientHeight;
                            const scale = 1.2;

                            const transform = d3.zoomIdentity
                                .translate(width / 2, height / 2)
                                .scale(scale)
                                .translate(-node.x, -node.y);

                            svg.transition()
                                .duration(750)
                                .call(zoom.transform, transform);
                        }
                    }
                }
                break;
        }
    });
}
