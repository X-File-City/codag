# Codag Product Improvement Guide

This document distills the current pain points around graph UX, workflow layout, comprehension, Copilot integration, and future enhancements. Treat each section as an actionable brief for an implementation engineer. Wherever possible, the instructions reference the relevant files so the engineer can jump in immediately.

---

## 1. Graph UX Revamp

### 1.1 Zoom-Aware Typography
- **Problem:** Node text is fixed at 11‑13px (`frontend/src/webview/styles.ts:138-154`), so everything becomes unreadable when zooming out.
- **Instruction:** Inside the D3 zoom handler (`frontend/src/webview.ts`, look for `const zoom = d3.zoom()`), calculate `currentZoom = event.transform.k`. Apply a `g.selectAll('.node text')` update that scales font-size inversely (e.g., `baseSize / sqrt(currentZoom)`, clamp between 10px and 18px). Also scale corner radius and stroke width so nodes maintain visual weight.
- **Deliverable:** Smooth text scaling with no layout shift, tested at zoom factors 0.1×, 1×, 5×.

### 1.2 Node Label Clamping
- **Problem:** Long labels stretch nodes horizontally which cascades to ultra-wide workflows.
- **Instruction:** Replace the raw `<text>` label with a foreignObject wrapper or implement manual word-wrapping. Enforce two-line clamp with ellipsis; emit a tooltip that shows full text + metadata (description, source) on hover. Keep node width constant (≈140px) to preserve Dagre metrics.
- **Deliverable:** Nodes remain roughly square regardless of label length; hover reveals the full label.

### 1.3 Adaptive Background Grid
- **Problem:** Pegboard background is drawn as a full-viewport rect (`frontend/src/webview.ts:264-285`), which dominates at low zoom.
- **Instruction:** Swap the static rect for an `svg.pattern` whose opacity fades as zoom decreases. Optionally switch to a coarser grid when `k < 0.5`. Consider moving the pegboard into a separate layer so it doesn’t get redrawn during panning.
- **Deliverable:** Subtle background that remains helpful for alignment without cluttering the view.

---

## 2. Workflow Layout Modernization

### 2.1 Global Workflow Arrangement
- **Problem:** Workflows are laid out independently and stacked via `currentYOffset` (`frontend/src/webview.ts:321-405`), yielding a tall column.
- **Instruction:**
  1. Build a meta-graph where each workflow becomes a node; edges exist if cross-workflow dependencies are detected (`workflowGroups`, check cross edges during layout).
  2. Use Dagre or ELK to arrange this meta-graph horizontally or in a radial “storyline”. Capture the bounding boxes returned by this pass.
  3. Offset per-workflow Dagre layouts based on the meta-graph coordinates.
- **Deliverable:** Workflows tile across both axes; cross-workflow edges travel shorter distances.

### 2.2 Evaluate ELK for Compound Layouts
- **Problem:** Manual bounds calculation is brittle; Dagre lacks native compound support in current usage.
- **Instruction:** Prototype with `elkjs` (can be bundled via webpack). Configure `elk.layered` with `hierarchyHandling=INCLUDE_CHILDREN`. Replace manual bounds (`group.bounds = {...}`) with ELK’s group nodes. Document trade-offs (layout time, determinism) and propose migration plan.
- **Deliverable:** Spike demonstrating a compound layout that auto-handles group bounds, with profiling numbers comparing Dagre vs ELK on sample graphs.

### 2.3 Workflow Packing Heuristic
- **Problem:** Even with compound layout, dense graphs can waste space.
- **Instruction:** After primary layout, run a secondary packing pass (force-based or simulated annealing) that nudges workflow bounding boxes while respecting margins and cross edges. Keep this optional behind a feature flag for testing.
- **Deliverable:** Configurable packing pass with telemetry (time taken, overlap resolution stats).

---

## 3. First-Impression Comprehension

### 3.1 Header Snapshot
- **Problem:** Users need context before exploring the graph.
- **Instruction:** Extend `getHtmlTemplate` to include a “Snapshot” card in the header showing: total workflows, LLM calls, critical-path duration (pull from graph metadata), and analysis timestamp. Populate via `postMessage` when new data loads.
- **Deliverable:** Always-visible overview that updates instantly after analysis.

### 3.2 Smart Collapse Defaults
- **Problem:** Large graphs overwhelm new users.
- **Instruction:** On first load, auto-collapse workflows beyond a configurable node threshold. For each collapsed group, render a mini preview (entry → first LLM → exit) inside the collapsed pill. Tie collapse state to `viewState.expandedWorkflowIds` so it persists between sessions.
- **Deliverable:** Manageable default view that still hints at each workflow’s contents.

### 3.3 Guided Onboarding
- **Problem:** Legend and critical-path meaning require explanation.
- **Instruction:** Implement an onboarding tour (3-4 steps) using lightweight overlays. Store completion in `localStorage`. Include controls to re-trigger the tour from the header menu.
- **Deliverable:** Optional walkthrough covering legend, node outlines, and side panel.

### 3.4 Breadcrumb Side Panel
- **Problem:** The current panel is static and doesn’t contextualize node placement.
- **Instruction:** When a node is selected, compute its path back to an entry point (reverse BFS along incoming edges) and display as breadcrumbs (e.g., `⚡ Entry > 🧠 LLM Step > 🔧 Tool`). Update `sidePanel` HTML template accordingly.
- **Deliverable:** Side panel that communicates “how we got here” without requiring graph navigation.

---

## 4. Copilot Participant Overhaul

### 4.1 Proper System Prompting
- **Problem:** The participant injects formatting rules as a user message (`frontend/src/copilot/workflow-participant.ts:123-146`), which the model may ignore.
- **Instruction:** Change `messages` to start with `vscode.LanguageModelChatMessage.System(systemPrompt)`. Keep user prompt untouched. Add regression tests (if available) to confirm the format rules stick.
- **Deliverable:** Consistent compact responses adhering to the instructions.

### 4.2 Viewport-Aware Context
- **Problem:** Copilot doesn’t know what the user sees.
- **Instruction:** Extend `WebviewManager.updateViewState` to capture `zoomLevel`, `viewportBounds`, and `expandedWorkflowIds`. When building metadata (`formatMetadata`), pass only nodes whose centers fall inside the viewport bounds. Update `metadata-provider` to support this filtering.
- **Deliverable:** Chat responses focused on what the user is actually viewing.

### 4.3 Graph Snapshot Tool
- **Problem:** Textual workflow dumps are verbose.
- **Instruction:**
  1. Add a chat tool (e.g., `codag.graphSnapshot`) that returns a compact JSON summary: visible workflows, node counts, cross edges.
  2. Optionally render an SVG snapshot server-side (using D3 in headless mode or a shared layout function) and return a data URI image for inline display.
  3. Adjust `compact-formatter` to output markdown grids/swimlanes instead of long ASCII trees; gate tree output behind a `mode: 'tree'` flag for explicit requests.
- **Deliverable:** Copilot window shows concise visuals or grids instead of sprawling text.

### 4.4 UI Command Hooks
- **Problem:** Copilot can’t manipulate the visualization.
- **Instruction:** Register VS Code commands such as `codag.zoomToWorkflow`, `codag.toggleWorkflow`, `codag.focusCriticalPath`. Wrap them in chat tools so Copilot can execute them. Document usage in the system prompt to encourage action-oriented replies.
- **Deliverable:** Interactive chat sessions where Copilot can change the graph state on behalf of the user.

---

## 5. Additional Product Ideas

### 5.1 Interaction Analytics
- **Instruction:** Instrument key interactions (expand/collapse, node selection) via the telemetry layer. Aggregate to surface “Most explored paths” as hints in the HUD. Ensure telemetry can be disabled for privacy-sensitive environments.

### 5.2 Shareable Artifacts
- **Instruction:** Provide export options: copy markdown summary, save PNG/SVG of current viewport. Hook into VS Code’s `showSaveDialog` for file exports.

### 5.3 Scenario Filters
- **Instruction:** Introduce HUD toggles for “Errors”, “Async Steps”, “Tool Calls”. Filter nodes/edges client-side based on metadata tags. Persist filter state in `viewState`.

### 5.4 Critical Path Playback
- **Instruction:** Prepare backend endpoints to return timing estimates. In the webview, animate a highlight traveling along the critical path with step timings. Add play/pause controls in the header.

---

## Execution Notes
- Keep UI changes inside `webview/` scripts to maintain clear separation from VS Code glue code.
- For major visual changes, update `static/media` snapshots (if screenshot tests exist) and document in `WEBVIEW_REFACTORING.md`.
- For Copilot work, add unit/integration coverage in `frontend/src/copilot/__tests__` (create directory if absent).
- Roll out improvements behind feature flags when feasible; expose flags via the extension’s configuration.

Use this guide as the master checklist. Implement features incrementally, validating performance and UX after each major milestone.
