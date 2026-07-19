import type Peer from 'peerjs';

type Listener = (...args: unknown[]) => void;

class TinyEmitter {
  private readonly listeners = new Map<string | symbol, Set<Listener>>();

  on(event: string | symbol, listener: Listener): this {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return this;
  }

  off(event: string | symbol, listener: Listener): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: string | symbol, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }

  removeAllListeners(event?: string | symbol): this {
    if (event === undefined) this.listeners.clear();
    else this.listeners.delete(event);
    return this;
  }
}

type ConnHandler = (conn: FakeDataConnection) => void;

/**
 * In-process PeerJS stand-in for PeerMesh unit tests. Peers register by id in a
 * shared broker map; `connect(id)` opens a paired FakeDataConnection.
 */
const broker = new Map<string, FakePeer>();

export function resetFakePeerBroker(): void {
  broker.clear();
}

export class FakeDataConnection extends TinyEmitter {
  open = false;
  readonly label: string;
  readonly peer: string;
  private pair: FakeDataConnection | null = null;

  constructor(remotePeerId: string, label: string) {
    super();
    this.peer = remotePeerId;
    this.label = label;
  }

  link(pair: FakeDataConnection): void {
    this.pair = pair;
  }

  markOpen(): void {
    this.open = true;
    this.emit('open');
  }

  send(data: unknown): void {
    if (!this.open || !this.pair?.open) return;
    queueMicrotask(() => this.pair?.emit('data', data));
  }

  close(): void {
    this.open = false;
    this.emit('close');
  }
}

export class FakePeer extends TinyEmitter {
  id = '';
  disconnected = false;
  private readonly connectionHandlers: ConnHandler[] = [];

  constructor(fixedId?: string) {
    super();
    queueMicrotask(() => {
      this.id = fixedId ?? `guest-${Math.random().toString(36).slice(2, 10)}`;
      if (fixedId && broker.has(fixedId)) {
        const err = Object.assign(new Error('ID taken'), { type: 'unavailable-id' });
        this.emit('error', err);
        return;
      }
      broker.set(this.id, this);
      this.emit('open', this.id);
    });
  }

  connect(remoteId: string, options?: { label?: string; reliable?: boolean }): FakeDataConnection {
    const label = options?.label ?? 'reliable';
    const local = new FakeDataConnection(remoteId, label);
    const remotePeer = broker.get(remoteId);
    if (!remotePeer) {
      queueMicrotask(() => {
        const err = Object.assign(new Error('peer missing'), { type: 'peer-unavailable' });
        this.emit('error', err);
      });
      return local;
    }
    const remote = new FakeDataConnection(this.id, label);
    local.link(remote);
    remote.link(local);
    queueMicrotask(() => {
      for (const handler of remotePeer.connectionHandlers) handler(remote);
      remotePeer.emit('connection', remote);
      remote.markOpen();
      local.markOpen();
    });
    return local;
  }

  on(event: string | symbol, listener: Listener): this {
    if (event === 'connection') {
      this.connectionHandlers.push(listener as ConnHandler);
    }
    return super.on(event, listener);
  }

  off(event: string | symbol, listener: Listener): this {
    if (event === 'connection') {
      const index = this.connectionHandlers.indexOf(listener as ConnHandler);
      if (index >= 0) this.connectionHandlers.splice(index, 1);
    }
    return super.off(event, listener);
  }

  destroy(): void {
    broker.delete(this.id);
    this.disconnected = true;
    this.removeAllListeners();
  }
}

export function createFakePeerFactory(): (
  id?: string,
  _options?: ConstructorParameters<typeof Peer>[1],
) => Peer {
  return (id?: string) => new FakePeer(id) as unknown as Peer;
}
