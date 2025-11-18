export type RealtimeEnvelope<T = any> = {
  type: string;
  documentId?: string;
  clientId?: string;
  payload?: T;
  [key: string]: any;
};

export type RealtimeOptions = {
  serverUrl: string; // e.g. ws://localhost:7071/ws
  documentId: string;
  user?: { id: string; name: string };
  onMessage?: (msg: RealtimeEnvelope) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (err: any) => void;
};

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private options: RealtimeOptions;
  private pingTimer: any = null;

  constructor(options: RealtimeOptions) {
    this.options = options;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.ws = new WebSocket(this.options.serverUrl);
    this.ws.onopen = () => {
      // join
      this.send({
        type: "join",
        documentId: this.options.documentId,
        user: this.options.user,
      });
      // start presence ping
      this.startPing();
      this.options.onOpen?.();
    };
    this.ws.onclose = () => {
      this.stopPing();
      this.options.onClose?.();
    };
    this.ws.onerror = (err) => {
      this.options.onError?.(err);
    };
    this.ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string);
        this.options.onMessage?.(msg);
      } catch {
        // ignore
      }
    };
  }

  disconnect() {
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(msg: RealtimeEnvelope) {
    if (!this.ws) {
      return;
    }
    if (this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify(msg));
  }

  // presence ping
  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.send({
        type: "presence:ping",
        user: this.options.user,
      });
    }, 5000);
  }
  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  // helper: domain events
  sendAnnotationAdd(payload: any) {
    this.send({ type: "annotation:add", payload });
  }
  sendAnnotationUpdate(payload: any) {
    this.send({ type: "annotation:update", payload });
  }
  sendAnnotationRemove(payload: any) {
    this.send({ type: "annotation:remove", payload });
  }
  sendNoteAdd(payload: any) {
    this.send({ type: "note:add", payload });
  }
  sendNoteUpdate(payload: any) {
    this.send({ type: "note:update", payload });
  }
  sendNoteRemove(payload: any) {
    this.send({ type: "note:remove", payload });
  }
}


