import { join } from 'path';
import { API } from './api';
import { log } from '../logger';
import { appendFileSync, fstat, readFileSync, writeFileSync } from 'fs';
import { utf8Stream, UNSAVED_SYMBOL } from '../constants';
import { commands, ExtensionContext, Uri, WebviewPanel } from 'vscode';
import { getTitle, ensureDirectoryExistence } from './utils';
import { consoleTestResultHandler } from 'tslint/lib/test';
import { updateUserDecisions } from '../commands';
import { getSafeFsPath } from '../path';
import { ANALYZER_EXE_PATH, PATCH_FOLDER, PROJECT_FOLDER } from '../constants';
import { Guid } from './guid';

var path = require('path');
var fs = require('fs');

interface IExtendedWebviewEnvContentOnly {
  content: string;
}

export interface IExtendedWebviewEnvDiff {
  patchPath?: string;
  leftPath?: string;
  rightPath: string;
  leftContent: string;
  rightContent: string;
  fileNotSupported: string;
  theme: any;
  tabSize: number;
}

export type ExtendedWebviewEnv = IExtendedWebviewEnvContentOnly | IExtendedWebviewEnvDiff;

export class ExtendedWebview {
  private _listener?: (e: IpcEvent) => void;
  private _saveListener?: (e: SaveEvent, env: IExtendedWebviewEnvDiff) => Promise<string>;
  public api: API;
  constructor(
    webViewPanel: WebviewPanel,
    templateName: 'notSupported',
    context: ExtensionContext,
    params: ExtendedWebviewEnv,
  );
  constructor(
    webViewPanel: WebviewPanel,
    templateName: 'diff',
    context: ExtensionContext,
    params: ExtendedWebviewEnv,
    mode: ExtendedWebviewMode,
  );
  constructor(
    public webViewPanel: WebviewPanel,
    private templateName: 'diff' | 'notSupported',
    private context: ExtensionContext,
    public params: ExtendedWebviewEnv,
    private mode?: ExtendedWebviewMode,
  ) {
    this.api = new API(webViewPanel.webview);
    this.setPanelTitle();
  }

  onDidReceiveMessage(listener: (e: IpcEvent) => void) {
    this._listener = listener;
  }

  onDidSave(listener: (e: SaveEvent, env: IExtendedWebviewEnvDiff) => Promise<string>) {
    this._saveListener = listener;
  }

  swap() {
    if ('leftPath' in this.params) {
      const { leftPath } = this.params;
      this.params.leftPath = this.params.rightPath;
      this.params.rightPath = leftPath as string;

      this.setPanelTitle(true);
      this.api.sendSwap();
    }
  }

  private getTemplate() {
    if (this.templateName === 'diff') {
      const path = join(this.context.extensionPath, 'resources', 'monaco', 'index.html');
      const file = readFileSync(path, utf8Stream);
      const webviewBaseHref = this.webViewPanel.webview.asWebviewUri(
        Uri.file(join(this.context.extensionPath, 'resources', 'monaco'))
      );

      return file
        .replace(/###base###/g, `${webviewBaseHref}/`)
        .replace(/###cspSource###/g, this.webViewPanel.webview.cspSource);
    }
    return readFileSync(join(this.context.extensionPath, 'resources', `${this.templateName}.html`), utf8Stream);
  }

  private setPanelTitleDraft() {
    if (!this.webViewPanel.title.includes(UNSAVED_SYMBOL)) {
      this.webViewPanel.title += UNSAVED_SYMBOL;
    }
  }

  private setPanelTitle(keepDraft?: boolean) {
    const getInitialTitle = () => {
      if ('rightContent' in this.params) {
        const { mode } = this;
        const { leftPath, rightPath, leftContent } = this.params;
        let title = getTitle(rightPath, mode || 'file', leftPath, !!leftContent);
        if (keepDraft && this.webViewPanel.title.includes(UNSAVED_SYMBOL)) {
          title += UNSAVED_SYMBOL;
        }
        return title;
      }
      return 'File is not supported';
    };
    this.webViewPanel.title = getInitialTitle();
  }

  private async onSave(e: SaveEvent) {
    if ('rightPath' in this.params) {
      let path = this.params.rightPath;
      if (this._saveListener) {
        path = await this._saveListener(e, this.params);
        if (path) {
          this.params.rightPath = path;
          this.setPanelTitle();
        }
      } else {
        log('webview is not listening on "save"');
      }
    }
  }

  render() {
    const { webview } = this.webViewPanel;

    webview.html = this.getTemplate();
    webview.onDidReceiveMessage(async (e: IpcEvent) => {
      switch (e.command) {
        case 'load':
          this.api.sendPayload(this.params);
          break;
        case 'change':
          this.setPanelTitleDraft();
          break;
        case 'save':
          let sevent = e as SaveEvent;
          if('rightContent' in this.params && 'leftPath' in this.params && 'patchPath' in this.params){
          if(sevent.contents.right.replace(/\r\n/g, "\n") === this.params.rightContent.replace(/\r\n/g, "\n"))
          {
            //No manual change
            updateUserDecisions('applied', this.params.patchPath!, this.params.leftPath!);
          } else {
            //Manual change
            let guid = Guid.newGuid();
            let outpath = getSafeFsPath(path.join(PATCH_FOLDER, 'manualpatches', this.params.leftPath!.replace(/^.*[\\\/]/, '')));
            let safeoutpath = outpath.split('.')[0] + "_" + guid + "." + outpath.split('.')[1];
            ensureDirectoryExistence(safeoutpath);
            updateUserDecisions('applied-with-manual-changes [' + safeoutpath + ']', this.params.patchPath!, this.params.leftPath!);
            
            writeFileSync(safeoutpath, this.params.rightContent, {
              encoding: 'utf8',
              flag: "w+"
            });
            console.log("Manual changes detected and the patch saved to: " + safeoutpath + "!");
          }
        }
          this.onSave(sevent);
          break;
        default:
          if (this._listener) {
            this._listener(e);
          }
          break;
      }
    });
  }
}
