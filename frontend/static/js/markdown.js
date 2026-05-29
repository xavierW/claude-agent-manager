class MarkdownRenderer {
    static render(text, snippet) {
        let html = this._escapeHtml(text);
        html = this._renderCodeBlocks(html);
        html = this._renderInline(html);
        html = this._renderBlocks(html);
        if (snippet) {
            html = `<pre><code>${html}</code></pre>`;
        }
        return html;
    }

    static highlightCode(html) {
        // Apply syntax highlighting to code blocks in rendered HTML
        const div = document.createElement('div');
        div.innerHTML = html;
        div.querySelectorAll('pre code').forEach(code => {
            const lang = code.className.replace('language-', '');
            if (['python', 'py', 'javascript', 'js', 'typescript', 'ts', 'go', 'rust', 'java', 'bash', 'sh', 'shell', 'json', 'yaml', 'yml', 'html', 'css', 'sql'].includes(lang)) {
                code.innerHTML = this._highlightTokens(code.textContent, lang);
            }
        });
        return div.innerHTML;
    }

    static _highlightTokens(code, lang) {
        // Token-based syntax highlighting
        const patterns = this._getPatterns(lang);
        const escaped = this._escapeHtml(code);
        if (!patterns || patterns.length === 0) return escaped;

        // Combine all patterns into one regex
        const combined = patterns.map(p => `(${p.pattern})`).join('|');
        const regex = new RegExp(combined, 'g');

        return escaped.replace(regex, (match, ...groups) => {
            for (let i = 0; i < groups.length; i++) {
                if (groups[i] !== undefined && patterns[i]) {
                    return `<span class="${patterns[i].cls}">${match}</span>`;
                }
            }
            return match;
        });
    }

    static _getPatterns(lang) {
        const common = [
            { pattern: /"(?:[^"\\]|\\.)*"/.source, cls: 'hljs-string' },
            { pattern: /'(?:[^'\\]|\\.)*'/.source, cls: 'hljs-string' },
            { pattern: /`(?:[^`\\]|\\.)*`/.source, cls: 'hljs-string' },
            { pattern: /\/\/[^\n]*/.source, cls: 'hljs-comment' },
            { pattern: /#[^\n]*/.source, cls: 'hljs-comment' },
            { pattern: /\b\d+\.?\d*\b/.source, cls: 'hljs-number' },
        ];

        const kw = (words) => ({
            pattern: new RegExp(`\\b(${words.join('|')})\\b`, 'i').source,
            cls: 'hljs-keyword'
        });

        switch (lang) {
            case 'python': case 'py':
                return [
                    kw(['def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'import', 'from', 'as', 'try', 'except', 'finally', 'raise', 'with', 'yield', 'lambda', 'pass', 'break', 'continue', 'and', 'or', 'not', 'is', 'None', 'True', 'False', 'async', 'await', 'self']),
                    { pattern: /"(?:[^"\\]|\\.)*"/.source, cls: 'hljs-string' },
                    { pattern: /'(?:[^'\\]|\\.)*'/.source, cls: 'hljs-string' },
                    { pattern: /"""(?:[^"\\]|\\.)*"""/.source, cls: 'hljs-string' },
                    { pattern: /#[^\n]*/.source, cls: 'hljs-comment' },
                    { pattern: /\b\d+\.?\d*\b/.source, cls: 'hljs-number' },
                    { pattern: /\b(print|len|range|int|str|float|list|dict|set|tuple|bool|type|isinstance|enumerate|zip|map|filter|sorted|reversed|open|input)\b/.source, cls: 'hljs-builtin' },
                    { pattern: /@\w+/.source, cls: 'hljs-decorator' },
                ];
            case 'javascript': case 'js': case 'typescript': case 'ts':
                return [
                    kw(['function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'super', 'class', 'extends', 'import', 'export', 'default', 'from', 'async', 'await', 'yield', 'of', 'in', 'typeof', 'instanceof', 'null', 'undefined', 'true', 'false', 'interface', 'type', 'enum', 'implements']),
                    { pattern: /"(?:[^"\\]|\\.)*"/.source, cls: 'hljs-string' },
                    { pattern: /'(?:[^'\\]|\\.)*'/.source, cls: 'hljs-string' },
                    { pattern: /`(?:[^`\\]|\\.)*`/.source, cls: 'hljs-string' },
                    { pattern: /\/\/[^\n]*/.source, cls: 'hljs-comment' },
                    { pattern: /\/\*[\s\S]*?\*\//.source, cls: 'hljs-comment' },
                    { pattern: /\b\d+\.?\d*\b/.source, cls: 'hljs-number' },
                    { pattern: /\b(console|document|window|Math|JSON|Promise|Array|Object|String|Number|Boolean|Map|Set|Symbol|Error|parseInt|parseFloat)\b/.source, cls: 'hljs-builtin' },
                ];
            case 'bash': case 'sh': case 'shell':
                return [
                    kw(['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac', 'in', 'function', 'return', 'exit', 'export', 'source', 'alias', 'unset']),
                    { pattern: /"(?:[^"\\]|\\.)*"/.source, cls: 'hljs-string' },
                    { pattern: /'(?:[^'\\]|\\.)*'/.source, cls: 'hljs-string' },
                    { pattern: /#[^\n]*/.source, cls: 'hljs-comment' },
                    { pattern: /\b\d+\.?\d*\b/.source, cls: 'hljs-number' },
                    { pattern: /\b(echo|cd|ls|cat|grep|sed|awk|curl|wget|git|npm|pip|docker|sudo|chmod|chown|mkdir|rm|cp|mv|find|head|tail|sort|uniq|wc|tar|gzip|ssh|scp)\b/.source, cls: 'hljs-builtin' },
                    { pattern: /\$\w+|\$\{[^}]+\}/.source, cls: 'hljs-property' },
                ];
            case 'go':
                return [
                    kw(['func', 'return', 'if', 'else', 'for', 'range', 'switch', 'case', 'default', 'break', 'continue', 'go', 'defer', 'select', 'chan', 'struct', 'interface', 'map', 'package', 'import', 'var', 'const', 'type', 'nil', 'true', 'false']),
                    { pattern: /"(?:[^"\\]|\\.)*"/.source, cls: 'hljs-string' },
                    { pattern: /'(?:[^'\\]|\\.)*'/.source, cls: 'hljs-string' },
                    { pattern: /`(?:[^`\\]|\\.)*`/.source, cls: 'hljs-string' },
                    { pattern: /\/\/[^\n]*/.source, cls: 'hljs-comment' },
                    { pattern: /\b\d+\.?\d*\b/.source, cls: 'hljs-number' },
                    { pattern: /\b(fmt|len|append|make|cap|close|delete|copy|panic|recover|print|println|error|string|int|bool|byte|rune|float64|int64)\b/.source, cls: 'hljs-builtin' },
                ];
            case 'json':
                return [
                    { pattern: /"(?:[^"\\]|\\.)*"\s*:/g.source, cls: 'hljs-property' },
                    { pattern: /"(?:[^"\\]|\\.)*"/.source, cls: 'hljs-string' },
                    { pattern: /\b\d+\.?\d*\b/.source, cls: 'hljs-number' },
                    { pattern: /\b(true|false|null)\b/.source, cls: 'hljs-keyword' },
                ];
            case 'sql':
                return [
                    kw(['SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TABLE', 'INDEX', 'INTO', 'VALUES', 'SET', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS', 'NULL', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MAX', 'MIN']),
                    { pattern: /'[^']*'/.source, cls: 'hljs-string' },
                    { pattern: /--[^\n]*/.source, cls: 'hljs-comment' },
                    { pattern: /\b\d+\.?\d*\b/.source, cls: 'hljs-number' },
                ];
            default:
                return common;
        }
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
