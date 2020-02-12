
'use strict';

import {
    Uri,
    workspace,
    CodeAction,
    WorkspaceFoldersChangeEvent
} from 'vscode';

import * as path from 'path';
import * as fs from 'fs';
import * as CP from 'child_process';



export class PerforceService {


    private static perforceWorkspaceMap = new Map<Uri,string>();

    public static async onDidChangeWorkspaceFolders({ added, removed }: WorkspaceFoldersChangeEvent):Promise<void> {
        for (let workspace of added) {
            if (!PerforceService.perforceWorkspaceMap.get(workspace.uri)) {
                var perforceWorkspace = await PerforceService.tryFindWorkspace(workspace.uri);
                PerforceService.perforceWorkspaceMap.set(workspace.uri, perforceWorkspace);
            }
        }
    }

    public static async tryFindWorkspace(workspaceUri:Uri):Promise<string> {

        var p4configFile = process.env.P4CONFIG || "P4CONFIG";
        if (p4configFile) {
            var foundFile = false;
            var dir = workspaceUri.fsPath;
            while (!foundFile) {               
                var filename = path.join(dir, p4configFile);
                if (fs.existsSync(filename)) {

                    var stats = fs.statSync(filename);
                    if (stats.isFile()) {        
                        var fileContents = fs.readFileSync(filename, {
                            encoding:'utf8'
                        });
                       
                        var settings = fileContents.split('\n').reduce((agg, val) => {
                            var parts = val.split('=');
                            agg.set(parts[0], parts[1]);
                            return agg;
                        }, new Map<string,string>());

                        var client = settings.get('CLIENT');
                        if (client) {
                            return Promise.resolve(client);
                        }
                    }
                }
                
                var newDir = path.dirname(dir);
                if (newDir === dir) {
                    break;
                }

                dir = newDir;
                
            }
        }
        
        const resp = await PerforceService.exec(workspaceUri, "clients");
        if (resp.err) {
            return Promise.reject(resp.stderr);
        }

        var clients = resp.stdout.trim().split('\n');
        if (!clients.length) {
            return Promise.reject("Failed to find any clients");
        }
        /*
        fileformat:
        Client clientname moddate root clientroot description
        */

        for (client of clients) {
            var parts = client?.trim().split(' ');
            if (parts && parts.length >= 5 && parts[0] === "Client") {
                var clientName = parts[1];
                var root = parts[4];
                
                if (root === workspaceUri.fsPath || path.relative(workspaceUri.fsPath, root).startsWith('..')) {
                    console.log('Found a workspace root!' , root);
                    return Promise.resolve(clientName);
                }

            }

        }
        

        return Promise.reject("Failed to find any perforce workspace");
    }

    public static exec(fileUri: Uri, command: string, args?:string, requireWorkspace?:boolean):Promise<any> {

        return new Promise((resolve) => {

            const wksFolder = workspace.getWorkspaceFolder(fileUri);
            if (!wksFolder) {
                resolve({
                    err: true,
                    stdout: '',
                    stderr: 'Failed to find workspace folder'
                });
                return;
            }

            var commandLine = 'p4.exe';
            if (requireWorkspace) {
                var p4client = PerforceService.perforceWorkspaceMap.get(wksFolder.uri);
                if (!p4client) {
                    resolve({
                        err: true,
                        stdout: '',
                        stderr: 'Failed to find perforce workspace'
                    });
                    return;
                }
                commandLine += ' -c ' + p4client;
            }

            commandLine += ' ' + command;

            if (args) {
                commandLine += ' ' +args;
            }

            var proc = CP.exec(commandLine, {
                cwd: wksFolder.uri.fsPath,
                
            });

            let stderr: string[] = [];
            let stdout: string[] = [];

            proc.stderr?.on('data', (data) => {
                stderr.push(data);
            });
            proc.stdout?.on('data', (data) => {
                stdout.push(data);
            });

            proc.on('exit', (code) => {
                console.log('exit code', code);
                console.log('stdout', stdout);
                console.log('stderr', stderr);
                

                resolve({
                    err: code!==0,
                    stdout: stdout.join(''),
                    stderr: stderr.join('')
                });
                
            });

        });

    }
}