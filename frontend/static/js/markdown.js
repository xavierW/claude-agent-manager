class MarkdownRenderer {
    static render(text) {
        let html = this._escapeHtml(text);
        html = this._renderCodeBlocks(html);
        html = this._renderInline(html);
        html = this._renderBlocks(html);
        return html;
    }

    static _escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    static _renderCodeBlocks(text) {
        const result = [];
        let remaining = text;
        while (remaining.length > 0) {
            const idx = remaining.indexOf('```');
            if (idx === -1) {
                result.push(remaining);
                break;
            }
            result.push(remaining.slice(0, idx));
            remaining = remaining.slice(idx + 3);
            const newlineIdx = remaining.indexOf('\n');
            const lang = newlineIdx > 0 ? remaining.slice(0, newlineIdx) : '';
            remaining = newlineIdx > 0 ? remaining.slice(newlineIdx + 1) : remaining;
            const closeIdx = remaining.indexOf('```');
            if (closeIdx === -1) {
                result.push(`<pre class="streaming"><code>${this._escapeHtml(remaining)}</code></pre>`);
                remaining = '';
            } else {
                const code = remaining.slice(0, closeIdx).trimEnd();
                const langAttr = lang ? ` class="language-${lang}"` : '';
                result.push(`<pre><code${langAttr}>${this._escapeHtml(code)}</code></pre>`);
                remaining = remaining.slice(closeIdx + 3);
            }
        }
        return result.join('');
    }

    static _renderInline(text) {
        text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
        text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
        return text;
    }

    static _renderBlocks(text) {
        const blocks = text.split(/\n\n+/);
        return blocks.map(block => {
            block = block.trim();
            if (!block) return '';
            if (block.startsWith('<pre') || block.startsWith('<div') || block.startsWith('<blockquote')) {
                return block;
            }
            const headerMatch = block.match(/^(#{1,3})\s/);
            if (headerMatch) {
                const level = headerMatch[1].length;
                return `<h${level}>${block.replace(/^#+\s+/, '')}</h${level}>`;
            }
            if (/^[\s]*[-*]\s/.test(block)) {
                const items = block.split('\n').filter(l => l.trim()).map(l =>
                    `<li>${l.replace(/^[\s]*[-*]\s+/, '')}</li>`
                ).join('');
                return `<ul>${items}</ul>`;
            }
            if (/^[\s]*\d+\.\s/.test(block)) {
                const items = block.split('\n').filter(l => l.trim()).map(l =>
                    `<li>${l.replace(/^[\s]*\d+\.\s+/, '')}</li>`
                ).join('');
                return `<ol>${items}</ol>`;
            }
            if (block.startsWith('>')) {
                const content = block.replace(/^>\s?/gm, '');
                return `<blockquote>${content}</blockquote>`;
            }
            const withBreaks = block.replace(/\n/g, '<br>');
            return `<p>${withBreaks}</p>`;
        }).join('\n');
    }
}
