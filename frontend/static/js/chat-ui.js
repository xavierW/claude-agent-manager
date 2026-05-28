class ChatUI {
    constructor(container) {
        this._container = container;
        this._messagesEl = this._container.querySelector('#chat-messages');
        this._emptyEl = this._container.querySelector('#empty-state');
        this._inputArea = document.getElementById('input-area');
        this._inputEl = document.getElementById('prompt-input');
        this._sendBtn = document.getElementById('send-btn');
        this._stopBtn = document.getElementById('stop-btn');
        this._currentAssistant = null;
        this._currentTextBlock = null;
        this._isStreaming = false;

        this._sendBtn.addEventListener('click', () => this.submit());
        this._stopBtn.addEventListener('click', () => EventBus.emit('interrupt'));

        this._inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.submit();
            }
        });

        this._inputEl.addEventListener('input', () => {
            this._sendBtn.disabled = !this._inputEl.value.trim() && !this._isStreaming;
            this._autoResize();
        });
    }

    submit() {
        const text = this._inputEl.value.trim();
        if (!text || this._isStreaming) return;
        this._inputEl.value = '';
        this._sendBtn.disabled = true;
        this._inputEl.style.height = 'auto';
        EventBus.emit('send-prompt', text);
    }

    showSession(sessionId, messages) {
        this._messagesEl.innerHTML = '';
        this._messagesEl.classList.remove('hidden');
        this._emptyEl.classList.add('hidden');
        this._inputArea.classList.remove('hidden');
        this._currentAssistant = null;
        this._currentTextBlock = null;

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
        this._currentAssistant = null;
        this._currentTextBlock = null;
    }

    addUserMessage(text) {
        this._renderUserMessage(text);
        this._scrollBottom();
    }

    startAssistantMessage() {
        if (this._currentAssistant) this.finishMessage();
        this._currentAssistant = this._createMessageEl('assistant-message');
        this._currentTextBlock = null;
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
        if (!this._currentAssistant) return;
        if (!this._currentAssistant.querySelector('.thinking-block')) {
            const el = document.createElement('details');
            el.className = 'thinking-block';
            el.innerHTML = '<summary>Thinking...</summary><div class="thinking-content"></div>';
            this._currentAssistant.insertBefore(el, this._currentAssistant.firstChild);
        }
        this._currentAssistant.querySelector('.thinking-content').textContent = thinking;
        this._scrollBottom();
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
            delete this._currentTextBlock?.dataset?.raw;
        }
        this._currentAssistant = null;
        this._currentTextBlock = null;
    }

    renderMessage(blocks) {
        if (!blocks || blocks.length === 0) return;
        if (this._currentAssistant) {
            this._currentAssistant.remove();
            this._currentAssistant = null;
            this._currentTextBlock = null;
        }
        const el = this._createMessageEl('assistant-message');
        for (const block of blocks) {
            this._appendBlock(el, block);
        }
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

    focus() {
        this._inputEl.focus();
    }

    // Private

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
            return;
        }
        if (msg.type === 'text') {
            const el = this._createMessageEl('assistant-message');
            const content = document.createElement('div');
            content.className = 'message-content';
            content.innerHTML = MarkdownRenderer.render(msg.text);
            el.appendChild(content);
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
                details.innerHTML = `<summary>Thinking...</summary>
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
