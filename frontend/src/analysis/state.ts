/**
 * Centralized state management for analysis operations.
 * All mutable state used across the extension is managed here.
 */

import { ExtractedCallGraph } from '../call-graph-extractor';
import { HttpConnection, CrossFileCall } from '../repo-structure';

// ============================================================================
// Static Analysis State (HTTP connections and cross-file calls)
// ============================================================================

let httpConnections: HttpConnection[] = [];
let crossFileCalls: CrossFileCall[] = [];
let repoFiles: { path: string; functions: { name: string; calls: string[]; line: number }[] }[] = [];

export function getHttpConnections(): HttpConnection[] {
    return httpConnections;
}

export function setHttpConnections(connections: HttpConnection[]): void {
    httpConnections = connections;
}

export function getCrossFileCalls(): CrossFileCall[] {
    return crossFileCalls;
}

export function setCrossFileCalls(calls: CrossFileCall[]): void {
    crossFileCalls = calls;
}

export function getRepoFiles(): { path: string; functions: { name: string; calls: string[]; line: number }[] }[] {
    return repoFiles;
}

export function setRepoFiles(files: { path: string; functions: { name: string; calls: string[]; line: number }[] }[]): void {
    repoFiles = files;
}

// ============================================================================
// Analysis Session State
// ============================================================================

let analysisSession = 0;

export function getAnalysisSession(): number {
    return analysisSession;
}

export function incrementAnalysisSession(): number {
    return ++analysisSession;
}

// ============================================================================
// Pending Analysis Task (retry after auth)
// ============================================================================

let pendingAnalysisTask: (() => Promise<void>) | null = null;

export function getPendingAnalysisTask(): (() => Promise<void>) | null {
    return pendingAnalysisTask;
}

export function setPendingAnalysisTask(task: (() => Promise<void>) | null): void {
    pendingAnalysisTask = task;
}

export function consumePendingAnalysisTask(): (() => Promise<void>) | null {
    const task = pendingAnalysisTask;
    pendingAnalysisTask = null;
    return task;
}

// ============================================================================
// Call Graph Cache
// ============================================================================

const cachedCallGraphs = new Map<string, ExtractedCallGraph>();

export function getCachedCallGraph(filePath: string): ExtractedCallGraph | undefined {
    return cachedCallGraphs.get(filePath);
}

export function setCachedCallGraph(filePath: string, graph: ExtractedCallGraph): void {
    cachedCallGraphs.set(filePath, graph);
}

export function hasCachedCallGraph(filePath: string): boolean {
    return cachedCallGraphs.has(filePath);
}

export function clearCachedCallGraphs(): void {
    cachedCallGraphs.clear();
}

// ============================================================================
// File Change Debouncing
// ============================================================================

const pendingChanges = new Map<string, NodeJS.Timeout>();

export function getPendingChange(filePath: string): NodeJS.Timeout | undefined {
    return pendingChanges.get(filePath);
}

export function setPendingChange(filePath: string, timeout: NodeJS.Timeout): void {
    pendingChanges.set(filePath, timeout);
}

export function deletePendingChange(filePath: string): boolean {
    return pendingChanges.delete(filePath);
}

export function clearPendingChange(filePath: string): void {
    const existing = pendingChanges.get(filePath);
    if (existing) {
        clearTimeout(existing);
        pendingChanges.delete(filePath);
    }
}

// ============================================================================
// Live File Indicator State
// ============================================================================

interface ActiveEditingState {
    timer: NodeJS.Timeout;
    functions: string[];
}

const activelyEditingFiles = new Map<string, ActiveEditingState>();
const changedFiles = new Map<string, string[]>();

export function getActivelyEditing(filePath: string): ActiveEditingState | undefined {
    return activelyEditingFiles.get(filePath);
}

export function setActivelyEditing(filePath: string, state: ActiveEditingState): void {
    activelyEditingFiles.set(filePath, state);
}

export function clearActivelyEditing(filePath: string): void {
    const existing = activelyEditingFiles.get(filePath);
    if (existing) {
        clearTimeout(existing.timer);
        activelyEditingFiles.delete(filePath);
    }
}

export function getChangedFunctions(filePath: string): string[] | undefined {
    return changedFiles.get(filePath);
}

export function setChangedFunctions(filePath: string, functions: string[]): void {
    changedFiles.set(filePath, functions);
}

export function clearChangedFunctions(filePath: string): void {
    changedFiles.delete(filePath);
}

// ============================================================================
// State Reset (for testing or clearing)
// ============================================================================

export function resetAllState(): void {
    httpConnections = [];
    crossFileCalls = [];
    analysisSession = 0;
    pendingAnalysisTask = null;
    cachedCallGraphs.clear();

    // Clear all pending change timeouts
    for (const timeout of pendingChanges.values()) {
        clearTimeout(timeout);
    }
    pendingChanges.clear();

    // Clear all editing timers
    for (const state of activelyEditingFiles.values()) {
        clearTimeout(state.timer);
    }
    activelyEditingFiles.clear();
    changedFiles.clear();
}
