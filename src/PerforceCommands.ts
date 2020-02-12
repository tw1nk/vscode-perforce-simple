'use strict';

import {
    Uri
} from 'vscode';

import {PerforceService} from './PerforceService';


export namespace PerforceCommands
{
    export function edit(fileUri: Uri): Promise<boolean> {
        return PerforceService.exec(fileUri, "edit", [fileUri.fsPath], [], true).then(function(resp) {
            return resp.err;
        });
    }

}