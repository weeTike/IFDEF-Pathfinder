import * as vscode from 'vscode';

export enum DebugModule {
    Folding = 1 << 0,
    Decorations = 1 << 1,
    Directives = 1 << 2,
}

let logger: vscode.LogOutputChannel | undefined;

export function getLogger(): vscode.LogOutputChannel {
    logger ??= vscode.window.createOutputChannel('IFDEF Extension', { log: true });
    return logger;
}

export function isTraceEnabled(): boolean {
    return getLogger().logLevel === vscode.LogLevel.Trace;
}

export function trace(module: DebugModule, message: string) {
    const moduleName = DebugModule[module];
    getLogger().trace(`[${moduleName}] ${message}`);
}

export function debug(module: DebugModule, message: string) {
    const moduleName = DebugModule[module];
    getLogger().debug(`[${moduleName}] ${message}`);
}

export function info(module: DebugModule, message: string) {
    const moduleName = DebugModule[module];
    getLogger().info(`[${moduleName}] ${message}`);
}

export function warning(module: DebugModule, message: string) {
    const moduleName = DebugModule[module];
    getLogger().warn(`[${moduleName}] ${message}`);
}
