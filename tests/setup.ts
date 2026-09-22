import "fake-indexeddb/auto";
if (typeof CustomEvent === "undefined") {
  globalThis.CustomEvent = class<T> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) {
      super(type, init);
      this.detail = init?.detail as T;
    }
    initCustomEvent() {}
  } as typeof CustomEvent;
}
