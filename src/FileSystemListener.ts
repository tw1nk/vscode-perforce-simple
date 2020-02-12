'use strict';

import {
    window,
    workspace,
    WorkspaceFolder,
    Disposable,
    TextDocument,
    TextDocumentChangeEvent,
    Uri
} from 'vscode';

import {PerforceCommands} from './PerforceCommands';

import {PerforceService} from './PerforceService';


export default class FileSystemListener
{


    private _disposable: Disposable;

    constructor() {
        const subscriptions: Disposable[] = [];

        workspace.onWillSaveTextDocument(e => {
            e.waitUntil(this.onWillSaveFile(e.document));
        }, subscriptions);


        this._disposable = Disposable.from.apply(this, subscriptions);
    }

    public dispose() {
        this._disposable.dispose();
    }

    private onWillSaveFile(doc: TextDocument): Promise<boolean> {
        return this.tryEditFile(doc.uri);
    }

    private tryEditFile(uri: Uri): Promise<boolean> {
        return PerforceCommands.edit(uri);
    }

}