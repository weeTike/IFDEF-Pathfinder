import * as vscode from 'vscode';
import { DirectiveType } from './directives';

const configSection = 'ifdefPathfinder';

/** Directive kinds that can show an inline hint. `elif` stands for every `#elif` variant. */
export type HintDirective = 'elif' | 'else' | 'endif';

export interface Settings {
    languages: readonly string[];
    inlineHintDirectives: ReadonlySet<HintDirective>;
    hideWhenEndifCommented: boolean;
    statusBarEnabled: boolean;
}

let cached: Settings | undefined;

function readSettings(): Settings {
    const config = vscode.workspace.getConfiguration(configSection);
    return {
        languages: config.get<string[]>('languages', ['c', 'cpp']),
        inlineHintDirectives: new Set(config.get<HintDirective[]>('inlineHints.directives', ['elif', 'else', 'endif'])),
        hideWhenEndifCommented: config.get('inlineHints.hideWhenEndifCommented', true),
        statusBarEnabled: config.get('statusBar.enabled', true),
    };
}

export function getSettings(): Settings {
    cached ??= readSettings();
    return cached;
}

export function isSupported(document: vscode.TextDocument): boolean {
    return getSettings().languages.includes(document.languageId);
}

/** Setting name within the `ifdefPathfinder` section, such as `languages` */
export function affectsSetting(event: vscode.ConfigurationChangeEvent, name: string): boolean {
    return event.affectsConfiguration(`${configSection}.${name}`);
}

export function onDidChangeSettings(listener: (event: vscode.ConfigurationChangeEvent) => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration(configSection)) {
            cached = undefined;
            listener(event);
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
