const EventBus = {
    _listeners: {},
    on(event, fn) {
        (this._listeners[event] = this._listeners[event] || []).push(fn);
    },
    emit(event, data) {
        (this._listeners[event] || []).forEach(fn => fn(data));
    }
};

class App {
    constructor() {
        this._state = {
            sessions: [],
            activeSessionId: null,
            messages: {},
            connected: false
        };

        this._ws = new WSClient(this._onMessage.bind(this));
        this._sessionPanel = new SessionPanel(document.getElementById('session-list'));
        this._chatUI = new ChatUI(document.getElementById('chat-container'));

        this._setupEvents();
        this._ws.connect();
    }

    _setupEvents() {
        document.getElementById('new-session-btn').addEventListener('click', () => {
            this._ws.send({ type: 'create_session' });
        });

        EventBus.on('select-session', (id) => this._selectSession(id));
        EventBus.on('delete-session', (id) => this._ws.send({ type: 'delete_session', session_id: id }));
        EventBus.on('send-prompt', (prompt) => this._sendQuery(prompt));
        EventBus.on('interrupt', () => this._interrupt());
        EventBus.on('regenerate', () => this._regenerate());
        EventBus.on('open-canvas', (data) => this._chatUI.openCanvas(data.content, data.language, data.title));
    }

    _onMessage(data) {
        switch (data.type) {
            case 'connection_state': return this._handleConnection(data);
            case 'sessions': return this._handleSessions(data);
            case 'session_created': return this._handleSessionCreated(data);
            case 'session_deleted': return this._handleSessionDeleted(data);
            case 'session_history': return this._handleHistory(data);
            case 'text': return this._handleText(data);
            case 'thinking': return this._handleThinking(data);
            case 'tool_use': return this._handleToolUse(data);
            case 'tool_result': return this._handleToolResult(data);
            case 'tool_input_delta': return this._handleToolInputDelta(data);
            case 'assistant': return this._handleAssistant(data);
            case 'result': return this._handleResult(data);
            case 'done': return this._handleDone(data);
            case 'error': return this._handleError(data);
        }
    }

    _handleConnection(data) {
        this._state.connected = data.state === 'connected';
        const el = document.getElementById('connection-indicator');
        const txt = document.getElementById('connection-text');
        if (el) {
            el.className = this._state.connected ? 'connected' : 'disconnected';
            txt.textContent = this._state.connected ? 'Connected' : 'Disconnected';
        }
        if (this._state.connected) {
            this._ws.send({ type: 'list_sessions' });
        }
    }

    _handleSessions(data) {
        this._state.sessions = data.sessions;
        this._sessionPanel.render(data.sessions);
        if (this._state.activeSessionId) {
            this._sessionPanel.setActive(this._state.activeSessionId);
        }
    }

    _handleSessionCreated(data) {
        this._ws.send({ type: 'list_sessions' });
    }

    _handleSessionDeleted(data) {
        if (this._state.activeSessionId === data.session_id) {
            this._state.activeSessionId = null;
            delete this._state.messages[data.session_id];
            this._chatUI.showEmpty();
        }
        this._ws.send({ type: 'list_sessions' });
    }

    _selectSession(id) {
        this._state.activeSessionId = id;
        this._sessionPanel.setActive(id);
        const msgs = this._state.messages[id];
        if (msgs) {
            this._chatUI.showSession(id, msgs);
        } else {
            this._ws.send({ type: 'get_history', session_id: id });
        }
        this._chatUI.focus();
    }

    _handleHistory(data) {
        this._state.messages[data.session_id] = data.messages;
        if (this._state.activeSessionId === data.session_id) {
            this._chatUI.showSession(data.session_id, data.messages);
        }
    }

    _sendQuery(prompt) {
        const sid = this._state.activeSessionId;
        if (!sid) return;

        if (!this._state.messages[sid]) {
            this._state.messages[sid] = [];
        }
        this._state.messages[sid].push({ role: 'user', content: prompt });

        this._chatUI.addUserMessage(prompt);
        this._chatUI.setStreaming(true);
        this._chatUI.showStatus('Processing...');
        this._ws.send({ type: 'query', session_id: sid, prompt });
    }

    _interrupt() {
        const sid = this._state.activeSessionId;
        if (sid) {
            this._ws.send({ type: 'interrupt', session_id: sid });
        }
    }

    _handleText(data) {
        if (data.session_id !== this._state.activeSessionId) return;
        this._chatUI.appendText(data.text);
    }

    _handleThinking(data) {
        if (data.session_id !== this._state.activeSessionId) return;
        this._chatUI.showStatus('Thinking...');
        this._chatUI.addThinkingBlock(data.thinking);
    }

    _handleToolUse(data) {
        if (data.session_id !== this._state.activeSessionId) return;
        const toolNames = { Read: 'Reading files...', Write: 'Writing file...', Edit: 'Editing file...', Bash: 'Executing command...', Glob: 'Searching files...', WebFetch: 'Fetching URL...', WebSearch: 'Searching web...' };
        this._chatUI.showStatus(toolNames[data.name] || `Running ${data.name}...`);
        this._chatUI.addToolUseBlock(data.name, data.input);
    }

    _handleToolResult(data) {
        if (data.session_id !== this._state.activeSessionId) return;
        this._chatUI.addToolResultBlock(data.content);
    }

    _handleToolInputDelta(data) {
        if (data.session_id !== this._state.activeSessionId) return;
        this._chatUI.showStatus('Preparing tool input...');
    }

    _handleAssistant(data) {
        if (data.session_id !== this._state.activeSessionId) return;
        const blocks = data.blocks || [];
        const hasContent = blocks.some(b => b.type === 'text' || b.type === 'tool_use' || b.type === 'tool_result');
        if (!hasContent) return; // partial signal, keep streaming
        this._chatUI.setStreaming(false);
        this._chatUI.renderMessage(blocks);
    }

    _handleResult(data) {
        // ignore - just final usage info
    }

    _handleDone(data) {
        if (data.session_id !== this._state.activeSessionId) return;
        this._chatUI.setStreaming(false);
        this._chatUI.finishMessage();
        this._generateFollowups();
    }

    _handleError(data) {
        console.error('Server error:', data);
        this._chatUI.setStreaming(false);
        this._chatUI.finishMessage();
        this._chatUI.addError(data.message || 'Unknown error');
    }

    _regenerate() {
        const sid = this._state.activeSessionId;
        if (!sid) return;
        const msgs = this._state.messages[sid];
        if (!msgs || msgs.length < 2) return;
        // Remove last assistant message + last user message from local state
        while (msgs.length > 0 && msgs[msgs.length - 1].role !== 'user') {
            msgs.pop();
        }
        const lastUser = msgs.pop(); // remove user message
        if (lastUser) {
            // Re-send the last user prompt
            this._sendQuery(lastUser.content);
        }
    }

    _generateFollowups() {
        const sid = this._state.activeSessionId;
        if (!sid) return;
        const msgs = this._state.messages[sid];
        if (!msgs || msgs.length === 0) return;

        // Simple heuristic: extract key terms and create follow-up suggestions
        const lastAssistant = msgs.filter(m => m.role !== 'user').slice(-1)[0];
        if (!lastAssistant) return;

        const text = this._extractText(lastAssistant).toLowerCase();
        const suggestions = [];

        if (text.includes('```') || text.includes('code') || text.includes('function')) {
            suggestions.push('Explain this code line by line');
            suggestions.push('Add error handling to this');
        }
        if (text.includes('error') || text.includes('bug') || text.includes('fix')) {
            suggestions.push('Show me other potential issues');
            suggestions.push('Write tests to prevent this');
        }
        if (text.length > 200) {
            suggestions.push('Summarize this in 3 bullet points');
        }
        suggestions.push('Can you elaborate on this?');
        suggestions.push('Show me an alternative approach');

        this._chatUI.showFollowups(suggestions.slice(0, 4));
    }

    _extractText(msg) {
        if (typeof msg.content === 'string') return msg.content;
        if (msg.type === 'assistant' && msg.blocks) {
            return msg.blocks.filter(b => b.type === 'text').map(b => b.text).join(' ');
        }
        if (msg.type === 'text') return msg.text;
        return '';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new App();
});
