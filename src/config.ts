import * as vscode from 'vscode';
import { DirectiveType } from './directives';

const configSection = 'ifdefPathfinder';

/** Directive kinds that can show an inline hint. `elif` stands for every `#elif` variant. */
export type HintDirective = 'elif' | 'else' | 'endif';

export interface Settings {
    inlineHintDirectives: ReadonlySet<HintDirective>;
    hideWhenEndifCommented: boolean;
    statusBarEnabled: boolean;
}

let cached: Settings | undefined;

function readSettings(): Settings {
    const config = vscode.workspace.getConfiguration(configSection);
    return {
        inlineHintDirectives: new Set(config.get<HintDirective[]>('inlineHints.directives', ['elif', 'else', 'endif'])),
        hideWhenEndifCommented: config.get('inlineHints.hideWhenEndifCommented', true),
        statusBarEnabled: config.get('statusBar.enabled', true),
    };
}

export function getSettings(): Settings {
    cached ??= readSettings();
    return cached;
}

export function onDidChangeSettings(listener: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration(configSection)) {
            cached = undefined;
            listener();
        }
    });
}

export function hintDirectiveOf(type: DirectiveType): HintDirective | undefined {
    switch (type) {
        case 'elif':
        case 'elseif':
        case 'elifdef':
        case 'elifndef':
            return 'elif';
        case 'else':
        case 'endif':
            return type;
        default:
            return undefined;
    }
}
