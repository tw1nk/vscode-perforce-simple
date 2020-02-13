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

import {PerforceService} from './PerforceService';
import * as fs  from 'fs';


export default class FileSystemListener
{


    private _disposable: Disposable;

    private _perforceService : PerforceService;

    constructor(perforceService:PerforceService) {
        const subscriptions: Disposable[] = [];

        workspace.onWillSaveTextDocument(e => {
            e.waitUntil(this.onWillSaveFile(e.document));
        }, subscriptions);

        this._perforceService = perforceService;
        this._disposable = Disposable.from.apply(this, subscriptions);
    }

    public dispose() {
        this._disposable.dispose();
    }

    private onWillSaveFile(doc: TextDocument): Promise<boolean> {
        return this.tryEditFile(doc.uri);
    }

    private tryEditFile(uri: Uri): Promise<boolean> {
        try {
            // only try to p4 edit files that are not writeable.
            fs.accessSync(uri.fsPath, fs.constants.W_OK);
            return Promise.resolve(true);
        } catch (e) {
            // file is not writeble run p4 edit.
            return this._perforceService.edit(uri);
        }
    }

}