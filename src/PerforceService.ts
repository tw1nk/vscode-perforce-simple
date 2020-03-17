
'use strict';

import {
    Uri,
    workspace,
    window,
    CodeAction,
    WorkspaceFoldersChangeEvent,
    TextDocument
} from 'vscode';

import * as path from 'path';
import * as fs from 'fs';
import * as CP from 'child_process';

type P4Info = {
    UserName: string
    ClientName: string
    ClientHost: string
    ClientRoot: string
    CurrentDirectory: string
    PeerAddress: string
    ClientAddress: string
    ServerAddress: string
    ServerRoot: string
    ServerDate: Date
    ServerUptime: string
    ServerVersion: string
    ServerID: string
    ServerServices: string[]
    ServerLicense: string
    ServerLicenseIP: string
    CaseHandling: string
};

type P4ClientsRow = {
    Client:string
    ClientRoot:string
    Host:string
};

type cmdOutput = {
    err: boolean
    stderr: string
    stdout: string
};


function isSameOrRelativeTo(from:string, to:string):boolean {
    let rel:string = path.relative(to, from);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}


export class PerforceService {

    private _channel = window.createOutputChannel('Perforce');

    public dispose() {
        this._channel.dispose();
    }

    private perforceWorkspaceMap = new Map<Uri,string>();

    public async onDidOpenTextDocument(doc:TextDocument) {
        /* currently NPE?
        for (let workspaceUri of this.perforceWorkspaceMap.keys()) {
            if (isSameOrRelativeTo(workspaceUri.fsPath, doc.uri.fsPath)) {
                return;
            }
        }

        let perforceWorkspace = await this.tryFindWorkspace(doc.uri);
        this.perforceWorkspaceMap.set(doc.uri, perforceWorkspace);
        */
    }

    public async onDidChangeWorkspaceFolders({ added, removed }: WorkspaceFoldersChangeEvent):Promise<void> {
        if (added !== undefined) {
        
            for (let workspace of added) {
                if (!this.perforceWorkspaceMap.get(workspace.uri)) {
                    let perforceWorkspace = await this.tryFindWorkspace(workspace.uri);
                    this.perforceWorkspaceMap.set(workspace.uri, perforceWorkspace);
                }
            }
        } else {
            // handle loose files
            for (let doc of workspace.textDocuments) {
                if (!this.perforceWorkspaceMap.get(doc.uri)) {
                    let perforceWorkspace = await this.tryFindWorkspace(doc.uri);
                    this.perforceWorkspaceMap.set(doc.uri, perforceWorkspace);
                }
            }
        }
        
    }

    public async tryFindWorkspace(workspaceUri:Uri):Promise<string> {
        console.log('Check workspace', workspaceUri)
        var p4configNames = [ process.env.P4CONFIG, "P4CONFIG", ".p4config" ];
        p4configNames.forEach(p4configFile => {
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
    
                            var client = settings.get('P4CLIENT');
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
        });

        // try to resolve workspace through perforce
        // First p4 info to check if it's the current workspace, and to get user name for subsequent commands
        const info = await this.info(workspaceUri).catch((err) => {console.error(err)});
        if (!info) {
            return Promise.reject("Failed to get info");
        }
        console.log('got info?', info);
        let root:string = info.ClientRoot;
        if (root) {
            if (isSameOrRelativeTo(workspaceUri.fsPath, root)) {
                console.log('Found a workspace root! from info' , root, info.ClientName);
                return Promise.resolve(info.ClientName);
            }
        }

        // failed to get the workspace from info, try getting workspace from p4 clients, this is really shady and will most likely fail.
        const clients = await this.clients(workspaceUri, info.UserName).catch((err) => {console.error(err)});
        if (!clients) {
            return Promise.reject("Failed to get clients");
        }
        var row:P4ClientsRow;
        for ( row of clients) {
            if (row.Host === info.ClientHost) {
                if (isSameOrRelativeTo(workspaceUri.fsPath, row.ClientRoot)) {
                    return Promise.resolve(row.Client);
                }
        
            }
        }
        
        return Promise.reject("Failed to find any perforce workspace");
    }


    public  async clients(wd:Uri, user:string):Promise<P4ClientsRow[]> {
        const p4clients = await this.exec(wd, "clients", ['-u', user], ['-ztag', '-F', '"%client%;%Root%;%Host%"'])
        if (p4clients.err) {
            return Promise.reject(p4clients.stderr);
        }

        var clients = p4clients.stdout.trim().split('\n');
        if (!clients.length) {
            return Promise.reject("Failed to find any clients");
        }
        
        
        var out: P4ClientsRow[] = [];
        for (var client of clients) {
            var line:P4ClientsRow = <P4ClientsRow>{};
            var parts = client.split(";");
            if (parts.length >= 3) {
                line.Client = parts[0].trim();
                line.ClientRoot =parts[1].trim();
                line.Host = parts[2].trim();
                out.push(line);
            } else {
                console.error('failed to parse p4 clients line', client);
            }
            
        }

        return Promise.resolve(out);
    }

    public  async info(wd:Uri):Promise<P4Info> {
        const p4info = await this.exec(wd, "info");
        if (p4info.err) {
            return Promise.reject(p4info.stderr);
        }

        var lines = p4info.stdout.split('\n');
        if (!lines.length) {
            return Promise.reject("No lines in result");
        }

        let result:P4Info = <P4Info>{};
        for (var line of lines) {
            var parts = line.trim().split(': ', 2);
            if (parts.length === 2) {
                switch(parts[0]) {
                    case "User name": 
                    result.UserName = parts[1].trim();
                    break;
                    case "Client name":
                        result.ClientName = parts[1].trim();
                    break;
                    case "Client host":
                        result.ClientHost = parts[1].trim();
                    break;
                    case "Client root":
                        result.ClientRoot = parts[1].trim();
                    break;
                    case "Current directory":
                        result.CurrentDirectory = parts[1].trim();
                    break;
                    case "Peer address":
                        result.PeerAddress = parts[1].trim();
                    break;
                    case "Client address":
                        result.ClientAddress = parts[1].trim();
                    break;
                    case "Server address":
                        result.ServerAddress = parts[1].trim();
                    break;
                    case "Server root":
                        result.ServerRoot = parts[1].trim();
                    break;
                    case "Server date":
                        result.ServerDate = new Date(parts[1].trim());
                    break;
                    case "Server uptime":
                        result.ServerUptime = parts[1].trim();
                    break;
                    case "Server version":
                        result.ServerVersion = parts[1].trim();
                    break;
                    case "ServerID":
                        result.ServerID = parts[1].trim();
                    break;
                    case "Server services":
                        result.ServerServices = parts[1].split(' ');
                    break;
                    case "Server license":
                        result.ServerLicense = parts[1].trim();
                    break;
                    case "Server license-ip":
                        result.ServerLicenseIP = parts[1].trim();
                    break;
                    case "Case Handling":
                        result.CaseHandling = parts[1].trim();
                    break;
                }
            }
        }

        return Promise.resolve(result);
    }

    public async edit(fileUri:Uri):Promise<boolean> {
        let result = await this.exec(fileUri, 'edit', [fileUri.fsPath], [], true);
        return !result.err;
    }

    public exec(wd: Uri, command: string, args:string[]=[], globalArgs:string[]=[], requireWorkspace:boolean=false):Promise<cmdOutput> {

        return new Promise((resolve) => {

            const wksFolder = workspace.getWorkspaceFolder(wd);
            if (!wksFolder) {
                resolve({
                    err: true,
                    stdout: '',
                    stderr: 'Failed to find workspace folder'
                });
                return;
            }
            var isWindows = /^win/.test(process.platform);
            var commandLine = isWindows ? 'p4.exe' : 'p4';;

            if (globalArgs.length) {
                commandLine += ' ' + globalArgs.join(' ');
            }

            if (requireWorkspace) {
                var p4client = this.perforceWorkspaceMap.get(wksFolder.uri);
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

            if (args.length) {
                commandLine += ' ' + args.join(' ');
            }

            console.log('Execute', commandLine);
            this._channel.appendLine('> ' + commandLine);

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
                const erroutput = stderr.join('');
                const output = stdout.join('');
                if (code) {
                    this._channel.appendLine(  erroutput );
                } else {
                    this._channel.appendLine(output);
                }
                this._channel.appendLine('');
                resolve({
                    err: !!code,
                    stdout: output,
                    stderr: erroutput,
                });
                
            });

        });

    }
}