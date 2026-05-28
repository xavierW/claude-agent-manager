class ChatUI {
    constructor(container) {
        this._container = container;
        this._messagesEl = this._container.querySelector('#chat-messages');
        this._emptyEl = this._container.querySelector('#empty-state');
        this._inputArea = document.getElementById('input-area');
        this._inputEl = document.getElementById('prompt-input');
        this._sendBtn = document.getElementById('send-btn');
        this._stopBtn = document.getElementById('stop-btn');
        this._slashMenu = document.getElementById('slash-menu');
        this._followupsEl = document.getElementById('suggested-followups');
        this._currentAssistant = null;
        this._currentTextBlock = null;
        this._currentThinking = null;
        this._isStreaming = false;
        this._slashIndex = -1;

        this._sendBtn.addEventListener('click', () => this.submit());
        this._stopBtn.addEventListener('click', () => EventBus.emit('interrupt'));
        this._setupInputHandlers();
        this._setupDragDrop();
        this._setupCanvasResize();
    }

    /* ========== Input ========== */

    _setupInputHandlers() {
        this._inputEl.addEventListener('keydown', (e) => {
            if (this._slashMenu && !this._slashMenu.classList.contains('hidden')) {
                if (e.key === 'ArrowDown') { e.preventDefault(); this._moveSlash(1); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); this._moveSlash(-1); return; }
                if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    const sel = this._slashMenu.querySelector('.slash-item.selected');
                    if (sel) this._applySlash(sel.dataset.cmd);
                    return;
                }
                if (e.key === 'Escape') { this._hideSlash(); return; }
            }
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.submit();
            }
        });

        this._inputEl.addEventListener('input', () => {
            this._sendBtn.disabled = !this._inputEl.value.trim() && !this._isStreaming;
            this._autoResize();
            this._detectSlash();
        });
    }

    _setupDragDrop() {
        const area = this._inputArea;
        area.addEventListener('dragover', (e) => { e.preventDefault(); area.classList.add('drag-over'); });
        area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
        area.addEventListener('drop', (e) => {
            e.preventDefault();
            area.classList.remove('drag-over');
            const files = Array.from(e.dataTransfer.files);
            EventBus.emit('files-dropped', files);
        });
    }

    submit() {
        const text = this._inputEl.value.trim();
        if (!text || this._isStreaming) return;
        this._inputEl.value = '';
        this._sendBtn.disabled = true;
        this._inputEl.style.height = 'auto';
        this._hideSlash();
        this._hideFollowups();
        EventBus.emit('send-prompt', text);
    }

    /* ========== Slash Commands ========== */

    _detectSlash() {
        const val = this._inputEl.value;
        const cursorPos = this._inputEl.selectionStart;
        const textBeforeCursor = val.substring(0, cursorPos);
        const lastNewline = textBeforeCursor.lastIndexOf('\n');
        const currentLine = textBeforeCursor.substring(lastNewline + 1);

        if (currentLine === '/' || currentLine.startsWith('/')) {
            this._showSlash(currentLine);
        } else {
            this._hideSlash();
        }
    }

    _showSlash(query) {
        this._slashMenu.classList.remove('hidden');
        const items = this._slashMenu.querySelectorAll('.slash-item');
        let visible = 0;
        items.forEach((item, i) => {
            const cmd = item.dataset.cmd;
            if (query === '/' || cmd.startsWith(query)) {
                item.style.display = 'flex';
                item.classList.toggle('selected', visible === 0);
                visible++;
            } else {
                item.style.display = 'none';
            }
        });
        this._slashIndex = visible > 0 ? 0 : -1;
    }

    _hideSlash() {
        this._slashMenu.classList.add('hidden');
        this._slashIndex = -1;
    }

    _moveSlash(dir) {
        const items = Array.from(this._slashMenu.querySelectorAll('.slash-item')).filter(
            el => el.style.display !== 'none'
        );
        if (items.length === 0) return;
        items[this._slashIndex]?.classList.remove('selected');
        this._slashIndex = (this._slashIndex + dir + items.length) % items.length;
        items[this._slashIndex]?.classList.add('selected');
        items[this._slashIndex]?.scrollIntoView({ block: 'nearest' });
    }

    _applySlash(cmd) {
        const val = this._inputEl.value;
        const cursorPos = this._inputEl.selectionStart;
        const textBeforeCursor = val.substring(0, cursorPos);
        const lastSlash = textBeforeCursor.lastIndexOf('/');
        const before = val.substring(0, lastSlash);
        const after = val.substring(cursorPos);
        const suffix = cmd + ' ';
        this._inputEl.value = before + suffix + after;
        const newPos = before.length + suffix.length;
        this._inputEl.setSelectionRange(newPos, newPos);
        this._inputEl.focus();
        this._hideSlash();
        this._sendBtn.disabled = false;
        this._autoResize();
    }

    /* ========== Follow-ups ========== */

    showFollowups(suggestions) {
        if (!suggestions || suggestions.length === 0) return;
        this._followupsEl.innerHTML = suggestions.map((s, i) =>
            `<div class="followup-chip" data-idx="${i}">${this._escape(s)}</div>`
        ).join('');
        this._followupsEl.classList.remove('hidden');
        this._followupsEl.querySelectorAll('.followup-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const text = chip.textContent;
                this._inputEl.value = text;
                this._sendBtn.disabled = false;
                this._autoResize();
                this.submit();
            });
        });
    }

    _hideFollowups() {
        this._followupsEl.innerHTML = '';
        this._followupsEl.classList.add('hidden');
    }

    /* ========== Session Display ========== */

    showSession(sessionId, messages) {
        this._messagesEl.innerHTML = '';
        this._messagesEl.classList.remove('hidden');
        this._emptyEl.classList.add('hidden');
        this._inputArea.classList.remove('hidden');
        this._currentAssistant = null;
        this._currentTextBlock = null;
        this._currentThinking = null;

        for (const msg of messages) {
            if (msg.role === 'user') {
                this._renderUserMessage(msg.content);
            } else {
                this._renderAssistantMessage(msg);
            }
        }
        this._scrollBottom();
    }

    showEmpty() {
        this._messagesEl.classList.add('hidden');
        this._emptyEl.classList.remove('hidden');
        this._inputArea.classList.add('hidden');
        this._hideFollowups();
        this._currentAssistant = null;
        this._currentTextBlock = null;
        this._currentThinking = null;
    }

    /* ========== Message Actions (Hover) ========== */

    _addMessageActions(el, text) {
        const actions = document.createElement('div');
        actions.className = 'message-actions';
        actions.innerHTML = `
            <button class="msg-action-btn copy-btn" title="Copy">Copy</button>
            <button class="msg-action-btn regenerate-btn" title="Regenerate">Regen</button>
        `;
        actions.querySelector('.copy-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(text).then(() => {
                const btn = actions.querySelector('.copy-btn');
                btn.textContent = 'Copied!';
                setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
            });
        });
        actions.querySelector('.regenerate-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            EventBus.emit('regenerate');
        });
        el.appendChild(actions);
    }

    _addCanvasButton(preEl) {
        const code = preEl.querySelector('code');
        const text = code ? code.textContent : preEl.textContent;
        const lang = code && code.className ? code.className.replace('language-', '') : '';
        const btn = document.createElement('button');
        btn.className = 'open-canvas-btn';
        btn.textContent = 'Open in Canvas';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            EventBus.emit('open-canvas', { content: text, language: lang, title: `${lang || 'code'} snippet` });
        });
        preEl.style.position = 'relative';
        preEl.appendChild(btn);
    }

    /* ========== Streaming ========== */

    addUserMessage(text) {
        this._renderUserMessage(text);
        this._scrollBottom();
    }

    startAssistantMessage() {
        if (this._currentAssistant) this.finishMessage();
        this._currentAssistant = this._createMessageEl('assistant-message');
        this._currentTextBlock = null;
        this._currentThinking = null;
    }

    appendText(text) {
        this._ensureTextBlock();
        const buffer = (this._currentTextBlock.dataset.raw || '') + text;
        this._currentTextBlock.dataset.raw = buffer;
        this._currentTextBlock.innerHTML = MarkdownRenderer.render(buffer);
        this._currentAssistant.classList.add('streaming-cursor');
        this._scrollBottom();
    }

    addThinkingBlock(thinking) {
        if (!this._currentAssistant) {
            this.startAssistantMessage();
        }
        if (!this._currentThinking) {
            this._currentThinking = document.createElement('details');
            this._currentThinking.className = 'thinking-block active';
            this._currentThinking.innerHTML =
                '<summary><span class="thinking-status">' +
                '<span class="thinking-dot"></span>' +
                '<span class="thinking-text">Thinking...</span>' +
                '</span></summary>' +
                '<div class="thinking-content"></div>';
            this._currentAssistant.insertBefore(this._currentThinking, this._currentAssistant.firstChild);
        }
        // Fast append (no typewriter per spec)
        this._currentThinking.querySelector('.thinking-content').textContent += thinking;
        this._updateThinkingStatus();
        this._scrollBottom();
    }

    _updateThinkingStatus() {
        if (!this._currentThinking) return;
        const content = this._currentThinking.querySelector('.thinking-content').textContent;
        const lines = content.trim().split('\n').filter(l => l.trim());
        const lastLine = lines[lines.length - 1] || '';
        const statusText = this._currentThinking.querySelector('.thinking-text');
        if (lastLine.length > 60) {
            statusText.textContent = lastLine.substring(0, 60) + '...';
        } else if (lastLine) {
            statusText.textContent = lastLine;
        } else {
            statusText.textContent = 'Thinking...';
        }
    }

    addToolUseBlock(name, input) {
        if (!this._currentAssistant) return;
        const el = document.createElement('div');
        el.className = 'tool-use';
        el.innerHTML = `<div class="tool-use-header">Tool: ${this._escape(name)}</div>
                        <div class="tool-use-input">${this._escape(JSON.stringify(input, null, 2))}</div>`;
        this._currentAssistant.appendChild(el);
        this._scrollBottom();
    }

    addToolResultBlock(content) {
        if (!this._currentAssistant) return;
        const el = document.createElement('div');
        el.className = 'tool-result';
        el.textContent = content;
        this._currentAssistant.appendChild(el);
        this._scrollBottom();
    }

    addApprovalCard(action, details) {
        if (!this._currentAssistant) {
            this.startAssistantMessage();
        }
        const card = document.createElement('div');
        card.className = 'approval-card';
        card.innerHTML = `
            <div class="approval-card-header">&#9888; Approval Required</div>
            <div class="approval-card-body">${this._escape(details)}</div>
            <div class="approval-card-actions">
                <button class="btn-primary approve-btn">Approve</button>
                <button class="btn-stop deny-btn">Deny</button>
            </div>
        `;
        card.querySelector('.approve-btn').addEventListener('click', () => {
            EventBus.emit('approve-action', action);
            card.querySelector('.approval-card-actions').innerHTML =
                '<span style="font-size:0.85em;color:var(--success)">Approved</span>';
        });
        card.querySelector('.deny-btn').addEventListener('click', () => {
            EventBus.emit('deny-action', action);
            card.querySelector('.approval-card-actions').innerHTML =
                '<span style="font-size:0.85em;color:var(--danger)">Denied</span>';
        });
        this._currentAssistant.appendChild(card);
        this._scrollBottom();
    }

    addError(message) {
        const el = document.createElement('div');
        el.className = 'error-block';
        el.textContent = message;
        this._messagesEl.appendChild(el);
        this._scrollBottom();
    }

    finishMessage() {
        if (this._currentAssistant) {
            this._currentAssistant.classList.remove('streaming-cursor');
            this._finalizeThinking();
            this._addPostRenderHooks();
            delete this._currentTextBlock?.dataset?.raw;
        }
        this._currentAssistant = null;
        this._currentTextBlock = null;
        this._currentThinking = null;
    }

    _finalizeThinking() {
        if (!this._currentAssistant) return;
        const thinking = this._currentAssistant.querySelector('.thinking-block');
        if (thinking) {
            thinking.classList.remove('active');
            thinking.open = false;
        }
    }

    _addPostRenderHooks() {
        if (!this._currentAssistant) return;
        // Open in Canvas buttons for code blocks
        this._currentAssistant.querySelectorAll('pre').forEach(pre => {
            this._addCanvasButton(pre);
        });
        // Copy + regenerate hover actions
        const text = this._currentAssistant.textContent || '';
        this._addMessageActions(this._currentAssistant, text);
    }

    renderMessage(blocks) {
        if (!blocks || blocks.length === 0) return;
        if (this._currentAssistant) {
            this._currentAssistant.remove();
            this._currentAssistant = null;
            this._currentTextBlock = null;
            this._currentThinking = null;
        }
        const el = this._createMessageEl('assistant-message');
        for (const block of blocks) {
            this._appendBlock(el, block);
        }
        // Post-render hooks
        const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('');
        this._addMessageActions(el, text);
        el.querySelectorAll('pre').forEach(pre => this._addCanvasButton(pre));
        this._scrollBottom();
    }

    setStreaming(v) {
        this._isStreaming = v;
        if (v) {
            this._stopBtn.classList.remove('hidden');
            this._sendBtn.classList.add('hidden');
        } else {
            this._stopBtn.classList.add('hidden');
            this._sendBtn.classList.remove('hidden');
            this._sendBtn.disabled = !this._inputEl.value.trim();
        }
    }

    focus() { this._inputEl.focus(); }

    /* ========== Canvas ========== */

    openCanvas(content, language, title) {
        const panel = document.getElementById('canvas-panel');
        const handle = document.getElementById('canvas-resize-handle');
        panel.classList.remove('hidden');
        handle.classList.remove('hidden');
        const tabs = document.getElementById('canvas-tabs');
        const tabId = 'canvas-tab-' + Date.now();

        const tab = document.createElement('div');
        tab.className = 'canvas-tab active';
        tab.dataset.tabId = tabId;
        tab.dataset.content = content;
        tab.dataset.language = language;
        tab.dataset.title = title;
        tab.textContent = title;
        tabs.querySelectorAll('.canvas-tab').forEach(t => t.classList.remove('active'));
        tabs.appendChild(tab);
        tab.addEventListener('click', () => this._switchCanvasTab(tab));

        this._renderCanvasContent(content, language, title);
        document.getElementById('canvas-copy').onclick = () => {
            navigator.clipboard.writeText(content);
        };
    }

    _switchCanvasTab(tab) {
        document.querySelectorAll('.canvas-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._renderCanvasContent(tab.dataset.content, tab.dataset.language, tab.dataset.title);
    }

    _renderCanvasContent(content, language, title) {
        const contentEl = document.getElementById('canvas-content');
        contentEl.innerHTML = `
            <div class="canvas-artifact">
                <div class="canvas-artifact-header">
                    <span>${this._escape(title || 'Artifact')}</span>
                    <span style="font-size:0.75em;color:var(--text-secondary)">${language || 'text'}</span>
                </div>
                <div class="canvas-artifact-body">
                    <pre><code class="${language ? 'language-' + language : ''}">${this._escape(content)}</code></pre>
                </div>
            </div>
        `;
    }

    closeCanvas() {
        const panel = document.getElementById('canvas-panel');
        const handle = document.getElementById('canvas-resize-handle');
        panel.classList.add('hidden');
        handle.classList.add('hidden');
        document.getElementById('canvas-tabs').innerHTML = '';
    }

    _setupCanvasResize() {
        const handle = document.getElementById('canvas-resize-handle');
        const panel = document.getElementById('canvas-panel');
        let startX, startWidth;

        handle.addEventListener('mousedown', (e) => {
            startX = e.clientX;
            startWidth = panel.offsetWidth;
            handle.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';

            const onMove = (ev) => {
                const delta = startX - ev.clientX;
                const newWidth = Math.max(280, Math.min(800, startWidth + delta));
                panel.style.width = newWidth + 'px';
            };
            const onUp = () => {
                handle.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        document.getElementById('canvas-close').addEventListener('click', () => this.closeCanvas());
        document.getElementById('canvas-fullscreen').addEventListener('click', () => {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                panel.requestFullscreen();
            }
        });
    }

    /* ========== Private ========== */

    _ensureTextBlock() {
        if (!this._currentAssistant) {
            this.startAssistantMessage();
        }
        if (!this._currentTextBlock) {
            this._currentTextBlock = document.createElement('div');
            this._currentTextBlock.className = 'message-content';
            this._currentAssistant.appendChild(this._currentTextBlock);
        }
    }

    _renderUserMessage(text) {
        const el = this._createMessageEl('user-message');
        const content = document.createElement('div');
        content.className = 'message-content';
        content.textContent = text;
        el.appendChild(content);
    }

    _renderAssistantMessage(msg) {
        if (msg.type === 'assistant' && msg.blocks) {
            const el = this._createMessageEl('assistant-message');
            for (const block of msg.blocks) {
                this._appendBlock(el, block);
            }
            const text = msg.blocks.filter(b => b.type === 'text').map(b => b.text).join('');
            this._addMessageActions(el, text);
            el.querySelectorAll('pre').forEach(pre => this._addCanvasButton(pre));
            return;
        }
        if (msg.type === 'text') {
            const el = this._createMessageEl('assistant-message');
            const content = document.createElement('div');
            content.className = 'message-content';
            content.innerHTML = MarkdownRenderer.render(msg.text);
            el.appendChild(content);
            this._addMessageActions(el, msg.text);
            el.querySelectorAll('pre').forEach(pre => this._addCanvasButton(pre));
        }
    }

    _appendBlock(parentEl, block) {
        switch (block.type) {
            case 'text': {
                const div = document.createElement('div');
                div.className = 'message-content';
                div.innerHTML = MarkdownRenderer.render(block.text);
                parentEl.appendChild(div);
                break;
            }
            case 'thinking': {
                const details = document.createElement('details');
                details.className = 'thinking-block';
                const firstLine = block.thinking.split('\n').find(l => l.trim()) || 'Thinking...';
                const preview = firstLine.length > 60 ? firstLine.substring(0, 60) + '...' : firstLine;
                details.innerHTML = `<summary>
                    <span class="thinking-status">
                        <span class="thinking-dot"></span>
                        <span class="thinking-text">${this._escape(preview)}</span>
                    </span></summary>
                    <div class="thinking-content">${this._escape(block.thinking)}</div>`;
                parentEl.appendChild(details);
                break;
            }
            case 'tool_use': {
                const div = document.createElement('div');
                div.className = 'tool-use';
                div.innerHTML = `<div class="tool-use-header">Tool: ${this._escape(block.name)}</div>
                    <div class="tool-use-input">${this._escape(JSON.stringify(block.input, null, 2))}</div>`;
                parentEl.appendChild(div);
                break;
            }
            case 'tool_result': {
                const div = document.createElement('div');
                div.className = 'tool-result';
                div.textContent = block.content;
                parentEl.appendChild(div);
                break;
            }
        }
    }

    _createMessageEl(className) {
        const el = document.createElement('div');
        el.className = `message ${className}`;
        this._messagesEl.appendChild(el);
        return el;
    }

    _scrollBottom() {
        requestAnimationFrame(() => {
            this._messagesEl.scrollTop = this._messagesEl.scrollHeight;
        });
    }

    _autoResize() {
        this._inputEl.style.height = 'auto';
        this._inputEl.style.height = Math.min(this._inputEl.scrollHeight, 200) + 'px';
    }

    _escape(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
