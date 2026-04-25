declare function acquireVsCodeApi(): {
  postMessage: (msg: unknown) => void;
  getState: <T = unknown>() => T | undefined;
  setState: <T = unknown>(s: T) => void;
};

export const vscode = acquireVsCodeApi();

export function send(msg: unknown) {
  vscode.postMessage(msg);
}

export function onMessage<T = unknown>(handler: (m: T) => void) {
  const fn = (e: MessageEvent) => handler(e.data as T);
  window.addEventListener("message", fn);
  return () => window.removeEventListener("message", fn);
}

export function saveState<T>(s: T) {
  vscode.setState(s);
}

export function loadState<T>(): T | undefined {
  return vscode.getState<T>();
}
