class SessionPanel {
    constructor(container) {
        this._container = container;
        this._activeId = null;
    }

    render(sessions) {
        if (sessions.length === 0) {
            this._container.innerHTML = '<div class="session-empty">No sessions yet</div>';
            return;
        }
        this._container.innerHTML = sessions.map(s => {
            const time = new Date(s.created_at).toLocaleDateString();
            return `
                <div class="session-item ${s.id === this._activeId ? 'active' : ''}"
                     data-session-id="${s.id}">
                    <span class="session-title">${this._escape(s.title)}</span>
                    <span class="session-time">${time}</span>
                    <button class="delete-btn" data-session-id="${s.id}"
                            title="Delete">&times;</button>
                </div>`;
        }).join('');

        this._container.querySelectorAll('.session-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('.delete-btn')) return;
                EventBus.emit('select-session', el.dataset.sessionId);
            });
        });

        this._container.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('Delete this chat session?')) {
                    EventBus.emit('delete-session', btn.dataset.sessionId);
                }
            });
        });
    }

    setActive(sessionId) {
        this._activeId = sessionId;
        this._container.querySelectorAll('.session-item').forEach(el => {
            el.classList.toggle('active', el.dataset.sessionId === sessionId);
        });
    }

    _escape(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
