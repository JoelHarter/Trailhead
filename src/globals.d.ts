// Globals available in Minecraft's script engine (it is neither a browser nor Node).
declare const console: {
  log(...data: unknown[]): void;
  info(...data: unknown[]): void;
  warn(...data: unknown[]): void;
  error(...data: unknown[]): void;
};

// Injected by tools/build.mjs.
declare const __NAMESPACE__: string;
declare const __BUILD_TIME__: string;
