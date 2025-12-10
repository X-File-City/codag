import axios, { AxiosInstance, AxiosError } from 'axios';
import * as vscode from 'vscode';

export interface SourceLocation {
    file: string;
    line: number;
    function: string;
}

export interface WorkflowNode {
    id: string;
    label: string;
    description?: string;
    type: string;
    source?: SourceLocation;
    metadata?: any;
    isEntryPoint?: boolean;
    isExitPoint?: boolean;
    isCriticalPath?: boolean;
}

export interface WorkflowEdge {
    source: string;
    target: string;
    label?: string;
    isCriticalPath?: boolean;
}

export interface LocationMetadata {
    line: number;
    type: string;
    description: string;
    function: string;
    variable?: string;
}

export interface FileMetadata {
    file: string;
    locations: LocationMetadata[];
    relatedFiles: string[];
}

export interface WorkflowMetadata {
    id: string;
    name: string;
    description: string;
    nodeIds: string[];
}

export interface WorkflowGraph {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    llms_detected: string[];
    workflows: WorkflowMetadata[];
}

export interface DeviceCheckResponse {
    machine_id: string;
    remaining_analyses: number;
    is_trial: boolean;
    is_authenticated: boolean;
}

export interface OAuthUser {
    id: string;
    email: string;
    name?: string;
    avatar_url?: string;
    provider: 'github' | 'google';
    is_paid: boolean;
}

export interface AnalyzeResult {
    graph: WorkflowGraph;
    remainingAnalyses: number;  // -1 for unlimited (authenticated users)
}

/**
 * Custom error for trial quota exhaustion.
 */
export class TrialExhaustedError extends Error {
    constructor() {
        super('Trial quota exhausted');
        this.name = 'TrialExhaustedError';
    }
}

export class APIClient {
    private client: AxiosInstance;
    private token: string | null = null;
    private deviceId: string | null = null;
    private outputChannel: vscode.OutputChannel;
    private baseURL: string;

    constructor(baseURL: string, outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
        this.baseURL = baseURL;
        this.client = axios.create({
            baseURL,
            timeout: 30000 // 30 second default timeout
        });

        this.client.interceptors.request.use(config => {
            this.outputChannel.appendLine(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
            return config;
        });

        this.client.interceptors.response.use(
            response => {
                this.outputChannel.appendLine(`API Response: ${response.status} ${response.config.url}`);
                return response;
            },
            error => {
                this.outputChannel.appendLine(`API Error: ${error.message}`);
                if (error.response) {
                    this.outputChannel.appendLine(`Status: ${error.response.status}`);
                    this.outputChannel.appendLine(`Data: ${JSON.stringify(error.response.data)}`);
                }
                return Promise.reject(error);
            }
        );
    }

    /**
     * Get the base URL for constructing OAuth URLs.
     */
    getBaseUrl(): string {
        return this.baseURL;
    }

    /**
     * Set the auth token for authenticated requests.
     */
    setToken(token: string): void {
        this.token = token;
        this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }

    /**
     * Clear the auth token.
     */
    clearToken(): void {
        this.token = null;
        delete this.client.defaults.headers.common['Authorization'];
    }

    /**
     * Set the device ID for trial tracking.
     */
    setDeviceId(deviceId: string): void {
        this.deviceId = deviceId;
        this.client.defaults.headers.common['X-Device-ID'] = deviceId;
    }

    /**
     * Check or register a trial device.
     */
    async checkDevice(machineId: string): Promise<DeviceCheckResponse> {
        const res = await this.client.post('/auth/device', { machine_id: machineId });
        return res.data;
    }

    /**
     * Link a device to an authenticated user.
     */
    async linkDevice(machineId: string): Promise<void> {
        await this.client.post('/auth/device/link', { machine_id: machineId });
    }

    /**
     * Get current authenticated user info.
     * Uses short timeout since this shouldn't block extension activation.
     */
    async getUser(): Promise<OAuthUser> {
        const res = await this.client.get('/auth/me', { timeout: 5000 }); // 5 second timeout
        return res.data;
    }

    // Legacy auth methods (kept for backwards compatibility)
    async register(email: string, password: string): Promise<string> {
        const res = await this.client.post('/auth/register', { email, password });
        return res.data.access_token;
    }

    async login(email: string, password: string): Promise<string> {
        const res = await this.client.post('/auth/login', { email, password });
        return res.data.access_token;
    }

    /**
     * Analyze workflow code.
     * Returns graph and remaining analyses count.
     * Throws TrialExhaustedError if trial quota is exhausted.
     */
    async analyzeWorkflow(
        code: string,
        filePaths: string[],
        frameworkHint?: string,
        metadata?: FileMetadata[]
    ): Promise<AnalyzeResult> {
        try {
            const res = await this.client.post('/analyze', {
                code,
                file_paths: filePaths,
                framework_hint: frameworkHint,
                metadata: metadata || []
            });

            // Extract remaining analyses from response header
            const remainingHeader = res.headers['x-remaining-analyses'];
            const remaining = remainingHeader !== undefined
                ? parseInt(remainingHeader, 10)
                : -1; // -1 means unlimited (authenticated)

            return {
                graph: res.data,
                remainingAnalyses: remaining
            };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const axiosError = error as AxiosError;
                if (axiosError.response?.status === 429) {
                    throw new TrialExhaustedError();
                }
            }
            throw error;
        }
    }

    /**
     * Legacy method for backwards compatibility.
     * Use analyzeWorkflow instead to get remaining analyses count.
     */
    async analyzeWorkflowLegacy(
        code: string,
        filePaths: string[],
        frameworkHint?: string,
        metadata?: FileMetadata[]
    ): Promise<WorkflowGraph> {
        const result = await this.analyzeWorkflow(code, filePaths, frameworkHint, metadata);
        return result.graph;
    }
}
