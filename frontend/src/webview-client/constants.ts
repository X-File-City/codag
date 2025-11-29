// Webview constants - centralized magic numbers

// ===== NODE DIMENSIONS =====
export const NODE_WIDTH = 140;
export const NODE_HEIGHT = 122;
export const NODE_HALF_WIDTH = 70;
export const NODE_HALF_HEIGHT = 61;
export const NODE_BORDER_RADIUS = 4;

// ===== COLLAPSED GROUP DIMENSIONS =====
export const COLLAPSED_GROUP_WIDTH = 260;
export const COLLAPSED_GROUP_HEIGHT = 150;
export const COLLAPSED_GROUP_HALF_WIDTH = 130;
export const COLLAPSED_GROUP_HALF_HEIGHT = 75;
export const COLLAPSED_GROUP_BORDER_RADIUS = 12;

// ===== GROUP BOUNDS PADDING =====
export const GROUP_BOUNDS_PADDING_X = 90;
export const GROUP_BOUNDS_PADDING_TOP = 126;
export const GROUP_BOUNDS_PADDING_BOTTOM = 81;

// ===== GROUP UI OFFSETS =====
export const GROUP_TITLE_OFFSET_X = 40;
export const GROUP_TITLE_OFFSET_Y = 24;
export const GROUP_COLLAPSE_BTN_X = 10;
export const GROUP_COLLAPSE_BTN_Y = 8;
export const GROUP_COLLAPSE_BTN_SIZE = 24;
export const GROUP_STROKE_WIDTH = 3;

// ===== EDGE STYLING =====
export const EDGE_STROKE_WIDTH = 6;
export const EDGE_HOVER_STROKE_WIDTH = 8;
export const EDGE_HOVER_HIT_WIDTH = 20;
export const EDGE_COLOR_HOVER = '#00d9ff';
export const CRITICAL_PATH_COLOR = '#FF6B6B';
export const CRITICAL_PATH_COLOR_HOVER = '#FF9999';

// ===== ANIMATIONS =====
export const TRANSITION_FAST = 300;
export const TRANSITION_NORMAL = 500;
export const VIEWPORT_UPDATE_DELAY = 150;

// ===== DAGRE LAYOUT =====
export const DAGRE_NODESEP = 50;
export const DAGRE_RANKSEP = 78;
export const DAGRE_MARGIN = 30;
export const WORKFLOW_SPACING = 150;

// ===== INTERACTION =====
export const DRAG_THRESHOLD = 5;
export const GRID_SIZE = 5;
export const TOOLTIP_OFFSET_X = 15;
export const TOOLTIP_OFFSET_Y = 10;

// ===== MINIMAP =====
export const MINIMAP_PADDING = 10;

// ===== NODE ICON =====
export const NODE_ICON_SCALE = 0.8;

// ===== ARROW =====
export const ARROW_HEAD_LENGTH = 16.8;

// ===== TYPE COLORS =====
export const TYPE_COLORS: Record<string, string> = {
    'trigger': '#FFB74D',
    'llm': '#64B5F6',
    'tool': '#81C784',
    'decision': '#BA68C8',
    'integration': '#FF8A65',
    'memory': '#4DB6AC',
    'parser': '#A1887F',
    'output': '#90A4AE'
};
