class WSClient {
    constructor(onMessage) {
        this._ws = null;
        this._onMessage = onMessage;
        this._reconnectDelay = 1000;
        this._maxDelay = 30000;
        this._queue = [];
    }

    connect() {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${proto}//${window.location.host}/ws`;
        this._ws = new WebSocket(url);

        this._ws.onopen = () => {
            this._reconnectDelay = 1000;
            this._dispatch({ type: 'connection_state', state: 'connected' });
            while (this._queue.length > 0) {
                this._sendRaw(this._queue.shift());
            }
        };

        this._ws.onclose = () => {
            this._dispatch({ type: 'connection_state', state: 'disconnected' });
            this._scheduleReconnect();
        };

        this._ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this._dispatch(data);
            } catch (e) {
                console.error('WS parse error:', e);
            }
        };

        this._ws.onerror = () => {};
    }

    send(data) {
        if (this._ws && this._ws.readyState === WebSocket.OPEN) {
            this._sendRaw(data);
        } else if (this._ws && this._ws.readyState === WebSocket.CONNECTING) {
            this._queue.push(data);
        }
    }

    _sendRaw(data) {
        this._ws.send(JSON.stringify(data));
    }

    _dispatch(data) {
        this._onMessage(data);
    }

    _scheduleReconnect() {
        setTimeout(() => {
            if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
                this.connect();
            }
        }, this._reconnectDelay);
        this._reconnectDelay = Math.min(this._reconnectDelay * 2, this._maxDelay);
    }
}
