# Webview Refactoring Plan

**Status:** Not yet started
**Priority:** Medium (improves maintainability)
**Risk:** Medium (requires careful migration)

## Problem

Current webview implementation uses embedded HTML/CSS/JS as TypeScript template strings, making it difficult to debug and maintain:

- `webview.ts` is 2,171 lines (~25,569 tokens)
- HTML template embedded as string in `template.ts`
- CSS embedded as string in `styles.ts`
- 2,000 lines of JavaScript embedded in `webview.ts`
- Impossible to get proper IDE support (no HTML/CSS autocomplete)
- Difficult to debug (no source maps, can't inspect static files)

## Goal

Migrate to proper static file architecture:

```
frontend/
├── media/webview/              # NEW: Static webview assets
│   ├── index.html             # Real HTML file (not string)
│   ├── styles.css             # Real CSS file
│   └── main.js                # Compiled webview bundle
├── src/
│   ├── webview.ts             # Extension-side (loads static files)
│   └── webview-client/        # NEW: Webview client TypeScript
│       ├── main.ts            # Entry point
│       ├── renderer.ts        # D3 rendering (extracted from webview.ts)
│       ├── minimap.ts         # Minimap module
│       ├── side-panel.ts      # Side panel module
│       ├── utilities.ts       # Helper functions
│       └── workflow-detection.ts
└── tsconfig.webview.json      # NEW: Separate TS config
```

## User Preferences (Confirmed)

- ✅ **Build:** Simple dual TypeScript configs (no webpack)
- ✅ **Dependencies:** Keep CDN for D3/Dagre (no bundling)
- ✅ **Approach:** Incremental migration (HTML → CSS → JS)

---

## Migration Plan (Incremental)

### Phase 1: Static HTML Template

**Goal:** Convert embedded HTML string to real `index.html` file

**Steps:**

1. **Create directory structure:**
   ```bash
   mkdir -p frontend/media/webview
   ```

2. **Create `frontend/media/webview/index.html`:**
   - Copy content from `frontend/src/webview/template.ts`
   - Remove TypeScript string wrapping
   - Add placeholder markers: `{{cspSource}}`, `{{stylesUri}}`, `{{scriptUri}}`
   - Keep D3/Dagre CDN links in `<head>`

   ```html
   <!DOCTYPE html>
   <html>
   <head>
       <meta charset="UTF-8">
       <meta http-equiv="Content-Security-Policy"
             content="default-src 'none';
                      script-src {{cspSource}} https://d3js.org https://cdn.jsdelivr.net;
                      style-src {{cspSource}} 'unsafe-inline';">
       <script src="https://d3js.org/d3.v7.min.js"></script>
       <script src="https://cdn.jsdelivr.net/npm/dagre@0.8.5/dist/dagre.min.js"></script>
       <link rel="stylesheet" href="{{stylesUri}}">
   </head>
   <body>
       <!-- Full HTML structure from template.ts -->
       <script src="{{scriptUri}}"></script>
   </body>
   </html>
   ```

3. **Update `webview.ts` `getHtml()` method:**
   ```typescript
   import * as fs from 'fs';
   import * as path from 'path';

   private getHtml(graph: WorkflowGraph): string {
       // Read static HTML template
       const htmlPath = vscode.Uri.joinPath(
           this.context.extensionUri,
           'media',
           'webview',
           'index.html'
       );
       let html = fs.readFileSync(htmlPath.fsPath, 'utf8');

       // Get URIs for resources (will be set up in later phases)
       const stylesUri = this.panel!.webview.asWebviewUri(
           vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webview', 'styles.css')
       );
       const scriptUri = this.panel!.webview.asWebviewUri(
           vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview-client', 'main.js')
       );

       // Replace placeholders
       html = html
           .replace(/{{cspSource}}/g, this.panel!.webview.cspSource)
           .replace(/{{stylesUri}}/g, stylesUri.toString())
           .replace(/{{scriptUri}}/g, scriptUri.toString());

       // Inject graph data
       const graphJson = JSON.stringify(graph);
       const nonce = this.getNonce();
       html = html.replace(
           '</head>',
           `<script nonce="${nonce}">window.__INITIAL_GRAPH_DATA__ = ${graphJson};</script></head>`
       );

       return html;
   }

   private getNonce(): string {
       let text = '';
       const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
       for (let i = 0; i < 32; i++) {
           text += possible.charAt(Math.floor(Math.random() * possible.length));
       }
       return text;
   }
   ```

4. **Update webview panel creation:**
   ```typescript
   this.panel = vscode.window.createWebviewPanel(
       'codag',
       'Codag',
       vscode.ViewColumn.Beside,
       {
           enableScripts: true,
           retainContextWhenHidden: true,
           localResourceRoots: [
               vscode.Uri.joinPath(this.context.extensionUri, 'media'),
               vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview-client')
           ]
       }
   );
   ```

5. **Test:** Verify webview still loads (will show unstyled content for now)

6. **Delete:** `frontend/src/webview/template.ts` (no longer needed)

---

### Phase 2: Static CSS File

**Goal:** Convert embedded CSS string to real `.css` file

**Steps:**

1. **Create `frontend/media/webview/styles.css`:**
   - Copy CSS content from `frontend/src/webview/styles.ts`
   - Remove TypeScript export wrapping
   - Remove backticks and string escaping
   - VSCode CSS variables (like `var(--vscode-editor-background)`) work in webviews

2. **Test:** Verify styling renders correctly in webview

3. **Delete:** `frontend/src/webview/styles.ts` (no longer needed)

---

### Phase 3: Static JavaScript (TypeScript → Compiled JS)

**Goal:** Convert embedded JavaScript to proper TypeScript modules

**Steps:**

1. **Create directory:**
   ```bash
   mkdir -p frontend/src/webview-client
   ```

2. **Create `frontend/tsconfig.webview.json`:**
   ```json
   {
     "extends": "./tsconfig.json",
     "compilerOptions": {
       "outDir": "out/webview-client",
       "lib": ["ES2020", "DOM"],
       "module": "ES2020",
       "target": "ES2020",
       "moduleResolution": "node"
     },
     "include": ["src/webview-client/**/*"]
   }
   ```

3. **Create `frontend/src/webview-client/main.ts` (entry point):**
   ```typescript
   // VSCode API
   declare const acquireVsCodeApi: any;
   const vscode = acquireVsCodeApi();

   // Graph data injected by extension
   declare global {
       interface Window {
           __INITIAL_GRAPH_DATA__: any;
       }
   }

   import { initializeGraph } from './renderer';

   const graphData = window.__INITIAL_GRAPH_DATA__ || { nodes: [], edges: [], llms_detected: [], workflows: [] };
   initializeGraph(graphData, vscode);
   ```

4. **Extract rendering code:**
   - Create `frontend/src/webview-client/renderer.ts`
   - Copy main D3 rendering code from `webview.ts` lines 194-2163
   - Remove template string wrapping
   - Export `initializeGraph(data, vscode)` function
   - Keep all D3/Dagre logic intact

5. **Extract modules** (from Phase 1 refactoring analysis):
   - `minimap.ts` - Minimap rendering (279 lines)
   - `side-panel.ts` - Node details panel (171 lines)
   - `message-handler.ts` - VSCode message handling (121 lines)
   - `utilities.ts` - Helper functions
   - `workflow-detection.ts` - Copy from existing `webview/scripts/`

6. **Update `package.json` scripts:**
   ```json
   {
     "scripts": {
       "compile": "tsc -p ./ && tsc -p tsconfig.webview.json",
       "watch": "tsc -watch -p ./ & tsc -watch -p tsconfig.webview.json",
       "vscode:prepublish": "npm run compile"
     }
   }
   ```

7. **Compile both configs:**
   ```bash
   npm run compile
   ```

8. **Verify output:**
   - `out/extension.js` (extension code)
   - `out/webview-client/main.js` (webview code)
   - `out/webview-client/*.js` (supporting modules)

9. **Test:** Full webview functionality

10. **Cleanup - Delete obsolete files:**
    - `frontend/src/webview/script-loader.ts`
    - `frontend/src/webview/scripts/` (moved to webview-client)
    - Large embedded script in `webview.ts` (now in renderer.ts)

---

## Build Process

**Two TypeScript Compilations:**

1. **Extension code:** `tsc -p ./`
   - Input: `src/**/*.ts` (except webview-client)
   - Output: `out/**/*.js`
   - Used by VSCode extension host

2. **Webview code:** `tsc -p tsconfig.webview.json`
   - Input: `src/webview-client/**/*.ts`
   - Output: `out/webview-client/**/*.js`
   - Loaded in webview via `asWebviewUri()`

**Watch mode for development:**
```bash
npm run watch
```

Both configs compile in parallel during watch mode.

---

## Data Flow After Migration

1. **Extension starts:**
   - Reads `media/webview/index.html` (static)
   - Generates URIs for `styles.css` and `main.js`
   - Injects graph data as `window.__INITIAL_GRAPH_DATA__`
   - Replaces placeholders in HTML

2. **Webview loads:**
   - Browser loads static HTML
   - Fetches `styles.css` via webview URI
   - Loads D3/Dagre from CDN
   - Executes injected data script (sets global)
   - Loads `main.js` via webview URI

3. **Main.js runs:**
   - Imports renderer and modules
   - Reads `window.__INITIAL_GRAPH_DATA__`
   - Initializes D3 visualization
   - Sets up message handlers

4. **Communication:**
   - Extension → Webview: `panel.webview.postMessage()`
   - Webview → Extension: `vscode.postMessage()`
   - Same as before, no changes needed

---

## Verification Checklist

After each phase, verify:

**Phase 1 (HTML):**
- [ ] Webview panel opens without errors
- [ ] Console shows no 404s or CSP violations
- [ ] (Unstyled content is expected)

**Phase 2 (CSS):**
- [ ] Styling renders correctly
- [ ] VSCode theme variables apply
- [ ] Dark/light theme switching works
- [ ] Layout looks identical to before

**Phase 3 (JS):**
- [ ] Graph visualization renders
- [ ] Nodes are draggable
- [ ] Edges have hover effects
- [ ] Edge labels display correctly
- [ ] Side panel opens on node click
- [ ] Code navigation works (openFile messages)
- [ ] Minimap renders in bottom-left
- [ ] HUD controls function (refresh, zoom, etc.)
- [ ] Progress indicator updates
- [ ] Incremental graph updates work
- [ ] No console errors
- [ ] Both `tsc` commands succeed

---

## Rollback Strategy

If issues occur during any phase:

1. **Revert `getHtml()` method** to old implementation
2. **Restore deleted files** from git history
3. **Revert package.json** script changes
4. **Delete new directories:**
   - `media/webview/`
   - `src/webview-client/`
   - `tsconfig.webview.json`

All changes are isolated to these areas, making rollback straightforward.

---

## Benefits After Migration

✅ **Cleaner code organization** - Separation of extension vs webview
✅ **Better IDE support** - Real HTML/CSS/JS files with autocomplete
✅ **Easier debugging** - Can inspect static files, add breakpoints
✅ **Faster development** - No string escaping, syntax highlighting
✅ **Standard web dev workflow** - Use any CSS preprocessor, linters
✅ **Better caching** - Static assets cached by VSCode
✅ **Easier testing** - Can unit test webview modules independently

---

## File Size Reduction (After Full Migration)

**Before:**
- `webview.ts`: 2,171 lines

**After:**
- `webview.ts`: ~200 lines (just loads static files)
- `media/webview/index.html`: ~150 lines
- `media/webview/styles.css`: ~500 lines
- `src/webview-client/`: Split across modules (~2,000 lines total)

**Result:** Much more maintainable, can read any file in one go!

---

## Next Steps

1. Create feature branch: `git checkout -b refactor/static-webview`
2. Start with **Phase 1** (HTML only)
3. Test thoroughly, commit
4. Proceed to **Phase 2** (CSS)
5. Test thoroughly, commit
6. Proceed to **Phase 3** (JS)
7. Final verification, commit
8. Create PR with all changes

---

## Notes

- **D3/Dagre:** Staying on CDN (no bundling needed)
- **Icons:** Currently inline SVG strings, could extract to `media/webview/icons/*.svg` later
- **Build time:** Dual TS compilation adds ~2-3 seconds to build
- **Watch mode:** Both configs watch in parallel, no performance impact
- **Extension packaging:** `.vsix` includes `media/` and `out/` directories automatically

---

**Document created:** 2025-01-24
**Last updated:** 2025-01-24
**Status:** Ready to implement when time permits
