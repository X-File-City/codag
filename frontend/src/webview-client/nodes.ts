// Node rendering
import * as state from './state';
import { getNodeIcon } from './icons';

declare const d3: any;

const TYPE_COLORS: Record<string, string> = {
    'trigger': '#FFB74D',
    'llm': '#64B5F6',
    'tool': '#81C784',
    'decision': '#BA68C8',
    'integration': '#FF8A65',
    'memory': '#4DB6AC',
    'parser': '#A1887F',
    'output': '#90A4AE'
};

export function renderNodes(
    dragstarted: (event: any, d: any) => void,
    dragged: (event: any, d: any) => void,
    dragended: (event: any, d: any) => void
): void {
    const { g, currentGraphData, workflowGroups } = state;

    // Filter nodes to only render those in workflow groups WITH 3+ NODES
    const allWorkflowNodeIds = new Set<string>();
    workflowGroups.forEach((grp: any) => {
        if (grp.nodes.length >= 3) {
            grp.nodes.forEach((id: string) => allWorkflowNodeIds.add(id));
        }
    });
    const nodesToRender = currentGraphData.nodes.filter((n: any) => allWorkflowNodeIds.has(n.id));

    // Create nodes
    const node = g.append('g')
        .attr('class', 'nodes-container')
        .selectAll('g')
        .data(nodesToRender)
        .enter()
        .append('g')
        .attr('class', 'node')
        .attr('data-node-id', (d: any) => d.id)
        .call(d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended));

    // Add rectangular background fill
    node.append('rect')
        .attr('width', 140)
        .attr('height', 70)
        .attr('x', -70)
        .attr('y', -35)
        .attr('rx', 4)
        .style('fill', 'var(--vscode-editor-background)')
        .style('stroke', 'none');

    // Add colored header background
    node.append('path')
        .attr('class', 'node-header')
        .attr('d', 'M -65,-35 L 65,-35 A 4,4 0 0,1 69,-31 L 69,-11 L -69,-11 L -69,-31 A 4,4 0 0,1 -65,-35 Z')
        .style('fill', (d: any) => TYPE_COLORS[d.type] || '#90A4AE')
        .style('opacity', 0.5)
        .style('stroke', 'none');

    // Add rectangular border with entry/exit/critical classes
    node.append('rect')
        .attr('width', 140)
        .attr('height', 70)
        .attr('x', -70)
        .attr('y', -35)
        .attr('rx', 4)
        .attr('class', (d: any) => {
            const classes: string[] = [];
            if (d.isCriticalPath) classes.push('critical-path');
            if (d.isEntryPoint) classes.push('entry-point');
            if (d.isExitPoint) classes.push('exit-point');
            return classes.join(' ');
        })
        .style('fill', 'none')
        .style('pointer-events', 'all');

    // Add title with dynamic sizing
    node.append('text')
        .attr('class', 'node-title')
        .attr('y', -21)
        .attr('dominant-baseline', 'middle')
        .each(function(this: SVGTextElement, d: any) {
            const maxWidth = 110;
            const minFontSize = 8;
            const currentFontSize = 13;

            d3.select(this).text(d.label);
            let textLength = this.getComputedTextLength();

            if (textLength > maxWidth) {
                const scale = maxWidth / textLength;
                let newFontSize = Math.max(minFontSize, currentFontSize * scale);
                d3.select(this).style('font-size', `${newFontSize}px`);

                textLength = this.getComputedTextLength();

                if (textLength > maxWidth && newFontSize === minFontSize) {
                    let text = d.label;
                    while (textLength > maxWidth && text.length > 3) {
                        text = text.slice(0, -1);
                        d3.select(this).text(`${text}...`);
                        textLength = this.getComputedTextLength();
                    }
                }
            }
        });

    // Add icon at bottom-right corner
    node.append('g')
        .attr('class', (d: any) => `node-icon ${d.type}`)
        .attr('transform', 'translate(44, 10) scale(0.8)')
        .html((d: any) => getNodeIcon(d.type));

    // Add node type label
    node.append('text')
        .attr('class', 'node-type')
        .text((d: any) => d.type.toUpperCase())
        .attr('x', 40)
        .attr('y', 21)
        .attr('dominant-baseline', 'middle')
        .style('text-anchor', 'end');

    // Add selection indicator (camera corners)
    const cornerSize = 8;
    const cornerOffsetX = 78;
    const cornerOffsetY = 42;
    node.append('g')
        .attr('class', 'node-selection-indicator')
        .attr('data-node-id', (d: any) => d.id)
        .style('display', 'none')
        .each(function(this: SVGGElement) {
            const group = d3.select(this);
            group.append('path').attr('d', `M -${cornerOffsetX} -${cornerOffsetY - cornerSize} L -${cornerOffsetX} -${cornerOffsetY} L -${cornerOffsetX - cornerSize} -${cornerOffsetY}`);
            group.append('path').attr('d', `M ${cornerOffsetX - cornerSize} -${cornerOffsetY} L ${cornerOffsetX} -${cornerOffsetY} L ${cornerOffsetX} -${cornerOffsetY - cornerSize}`);
            group.append('path').attr('d', `M -${cornerOffsetX} ${cornerOffsetY - cornerSize} L -${cornerOffsetX} ${cornerOffsetY} L -${cornerOffsetX - cornerSize} ${cornerOffsetY}`);
            group.append('path').attr('d', `M ${cornerOffsetX - cornerSize} ${cornerOffsetY} L ${cornerOffsetX} ${cornerOffsetY} L ${cornerOffsetX} ${cornerOffsetY - cornerSize}`);
        });

    // Tooltip on hover
    node.append('title')
        .text((d: any) => {
            let text = `${d.label}\nType: ${d.type}`;
            if (d.description) {
                text += `\n\n${d.description}`;
            }
            return text;
        });

    // Set initial positions
    node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);

    state.setNode(node);
}
