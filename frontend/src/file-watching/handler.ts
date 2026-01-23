/**
 * File watching and change detection handler.
 * Handles debouncing, live indicators, and analysis scheduling.
 */

import * as vscode from 'vscode';
import { CacheManager } from '../cache';
import { WebviewManager } from '../webview';
import { MetadataBatcher, buildMetadataContext } from '../metadata-batcher';
import { performLocalUpdate } from './local-update';
import { withHttpEdges } from '../analysis/helpers';
import {
    clearPendingChange, setPendingChange, deletePendingChange,
    getCachedCallGraph,
    clearActivelyEditing, setActivelyEditing,
    clearChangedFunctions, setChangedFunctions
} from '../analysis/state';

/**
 * Context needed for file analysis scheduling.
 */
export interface FileWatchingContext {
    cache: CacheManager;
    webview: WebviewManager;
    log: (msg: string) => void;
    metadataBatcher: MetadataBatcher;
}

/**
 * Configuration for file watching.
 */
export interface FileWatchingConfig {
    debounceMs: number;
    activeToChangedMs: number;
}

/**
 * Schedule file analysis with debouncing.
 * Tries instant local update first, falls back to LLM analysis.
 *
 * @param ctx - Context with cache, webview, log, and metadataBatcher
 * @param uri - URI of the file that changed
 * @param source - Source of the change (watcher, save, create)
 * @param config - Debounce and timing configuration
 * @param fallbackAnalyze - Callback for full LLM analysis fallback
 */
export async function scheduleFileAnalysis(
    ctx: FileWatchingContext,
    uri: vscode.Uri,
    source: string,
    config: FileWatchingConfig,
    fallbackAnalyze: (uri: vscode.Uri) => Promise<void>
): Promise<void> {
    const { cache, webview, log, metadataBatcher } = ctx;
    const filePath = uri.fsPath;

    // Ignore compiled output files (they change when source files compile)
    if (filePath.includes('/out/') || filePath.includes('\\out\\')) {
        return;
    }

    // NOTE: We don't send immediate notification here.
    // We wait for tree-sitter diff to know WHICH functions changed.
    // Notification is sent after performLocalUpdate() completes.

    // Clear existing timeout for this file
    clearPendingChange(filePath);

    // Schedule new analysis after debounce period
    const timeout = setTimeout(async () => {
        deletePendingChange(filePath);
        log(`File changed (${source}): ${filePath}`);

        // Check if this file is in our cached workflows
        const isCached = await cache.isFileCached(filePath);
        if (isCached) {
            // Try instant local update first (tree-sitter/call-graph extraction)
            const localResult = await performLocalUpdate({ cache, log }, uri);

            if (localResult) {
                // Local update succeeded
                if (localResult.nodesAdded.length > 0 || localResult.nodesRemoved.length > 0 ||
                    localResult.edgesAdded > 0 || localResult.edgesRemoved > 0) {
                    // Update graph in webview (with HTTP edges)
                    webview.updateGraph(withHttpEdges(localResult.graph, log)!);
                    log(`Graph updated locally (instant) via tree-sitter`);

                    // Queue for metadata if new nodes need labels
                    if (localResult.needsMetadata.length > 0) {
                        const relativePath = vscode.workspace.asRelativePath(filePath);
                        const newCallGraph = getCachedCallGraph(filePath);
                        const context = buildMetadataContext(relativePath, cache, newCallGraph);
                        if (context) {
                            metadataBatcher.queueFile(relativePath, context);
                            log(`Queued ${relativePath} for metadata batch (${context.functions.length} functions)`);
                        }
                    }

                    // === Live file indicator: Send "active" notification with changed functions ===
                    if (localResult.changedFunctions.length > 0) {
                        // Use relative path to match node.source.file format in graph data
                        const relativePath = vscode.workspace.asRelativePath(filePath);
                        webview.notifyFileStateChange([{
                            filePath: relativePath,
                            functions: localResult.changedFunctions,
                            state: 'active'
                        }]);

                        // Clear existing transition timer
                        clearActivelyEditing(filePath);

                        // Set timer to transition to "changed" state after inactivity
                        const transitionTimer = setTimeout(() => {
                            clearActivelyEditing(filePath);
                            setChangedFunctions(filePath, localResult.changedFunctions);
                            webview.notifyFileStateChange([{
                                filePath: relativePath,
                                functions: localResult.changedFunctions,
                                state: 'changed'
                            }]);
                        }, config.activeToChangedMs);

                        setActivelyEditing(filePath, {
                            timer: transitionTimer,
                            functions: localResult.changedFunctions
                        });
                    }
                } else {
                    // No structural changes - clear any existing indicators
                    clearActivelyEditing(filePath);
                    clearChangedFunctions(filePath);
                    const relativePath = vscode.workspace.asRelativePath(filePath);
                    webview.notifyFileStateChange([{ filePath: relativePath, state: 'unchanged' }]);
                }
            } else {
                // Fall back to full LLM analysis
                log(`Falling back to full analysis: ${filePath}`);
                webview.showLoading('Detecting changes...');
                await fallbackAnalyze(uri);

                // Clear file change indicator after LLM analysis
                clearChangedFunctions(filePath);
                const relativePath = vscode.workspace.asRelativePath(filePath);
                webview.notifyFileStateChange([{ filePath: relativePath, state: 'unchanged' }]);
            }
        }
    }, config.debounceMs);

    setPendingChange(filePath, timeout);
}
