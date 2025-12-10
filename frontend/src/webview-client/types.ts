// Type declarations for webview globals
declare const d3: any;
declare const dagre: any;
declare function acquireVsCodeApi(): any;

interface Window {
    __GRAPH_DATA__: any;
    // Global functions exposed to window
    refreshAnalysis: () => void;
    toggleExpandAll: () => void;
    formatGraph: () => void;
    toggleLegend: () => void;
    resetZoom: () => void;
    zoomIn: () => void;
    zoomOut: () => void;
    closePanel: () => void;
}

// Graph data types
export interface SourceLocation {
    file: string;
    line: number;
    function: string;
}

export interface WorkflowNode {
    id: string;
    label: string;
    type: 'trigger' | 'llm' | 'tool' | 'decision' | 'integration' | 'memory' | 'parser' | 'output';
    description?: string;
    source?: SourceLocation;
    isEntryPoint?: boolean;
    isExitPoint?: boolean;
    isCriticalPath?: boolean;
    x?: number;
    y?: number;
    fx?: number;
    fy?: number;
}

export interface WorkflowEdge {
    source: string;
    target: string;
    label?: string;
    dataType?: string;
    description?: string;
    sourceLocation?: SourceLocation;
    isCriticalPath?: boolean;
}

export interface Workflow {
    id: string;
    name: string;
    description?: string;
    nodeIds: string[];
}

export interface WorkflowGraph {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    llms_detected: string[];
    workflows: Workflow[];
}

export interface WorkflowGroup {
    id: string;
    name: string;
    description?: string;
    nodes: string[];
    llmProviders: string;
    collapsed: boolean;
    color: string;
    level: number;
    bounds?: {
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
    };
    centerX?: number;
    centerY?: number;
}

export interface NodePosition {
    x: number;
    y: number;
    fx?: number;
    fy?: number;
}

export interface SavedState {
    zoomTransform: any;
    collapsedWorkflows: string[];
    selectedNodeId: string | null;
    nodePositions: Map<string, NodePosition>;
}

export interface GraphDiff {
    nodes: {
        added: WorkflowNode[];
        removed: string[];
        updated: WorkflowNode[];
    };
    edges: {
        added: WorkflowEdge[];
        removed: WorkflowEdge[];
        updated: WorkflowEdge[];
    };
}
