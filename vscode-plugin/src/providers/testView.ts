import * as vscode from 'vscode';
import { IFix } from '../interfaces';
import * as path from 'path';
import { getIssues } from '../services/fakeAiFixCode';
import { objectify } from 'tslint/lib/utils';
import { isObjectLiteralExpression } from 'typescript';

let tree: any;

export class TestView {
	public treeDataProvider: NodeWithIdTreeDataProvider | undefined;
	constructor(context: vscode.ExtensionContext) {
		initTree().then(() => {
			this.treeDataProvider = new NodeWithIdTreeDataProvider();
			const view = vscode.window.createTreeView('testView', { treeDataProvider: this.treeDataProvider, showCollapseAll: true });
			context.subscriptions.push(view);

			vscode.commands.registerCommand('testView.reveal', async () => {
				const key = await vscode.window.showInputBox({ placeHolder: 'Type the label of the item to reveal' });
				if (key) {
					await view.reveal({ key }, { focus: true, select: false, expand: true });
				}
			});
			vscode.commands.registerCommand('testView.changeTitle', async () => {
				const title = await vscode.window.showInputBox({ prompt: 'Type the new title for the Test View', placeHolder: view.title });
				if (title) {
					view.title = title;
				}
			});
		});
	}
}

async function initTree() {
	tree = await getIssues();
}

let nodes: string[] = [];
let counter = 1;

class NodeWithIdTreeDataProvider implements vscode.TreeDataProvider<{ key: string }> {

	private _onDidChangeTreeData: vscode.EventEmitter<{ key: string } | undefined | null | void> = new vscode.EventEmitter<{ key: string } | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<{ key: string } | undefined | null | void> = this._onDidChangeTreeData.event;

	refresh(patchPath: string): void {
		if (patchPath && patchPath !== '') {
			filterTree(patchPath);
		}
		this._onDidChangeTreeData.fire();
	}

	getChildren(element: { key: string }): { key: string }[] {
		return getChildren(element ? element.key : undefined!).map(key => getNode(key));
	}

	getTreeItem(element: { key: string }): vscode.TreeItem {
		const treeItem = getTreeItem(element.key);
		treeItem.id = (++counter).toString();
		return treeItem;
	}

	getParent({ key }: { key: string }): { key: string } {
		const parentKey = key.substring(0, key.length - 1);
		return (parentKey ? new Key(parentKey) : void 0)!;
	}

}

function getChildren(key: string) {
	if (!key) {
		return Object.keys(tree);
	} else {
		return [];
	}
}

function getTreeItem(key: string): vscode.TreeItem {
	const treeElement = getTreeElement(key);
	const tooltip = new vscode.MarkdownString(`$(zap) Click to show the source of ${key}`, true);
	let itemLabel = '';
	if (treeElement) {
		itemLabel = <any>{ label: 'Found ' + key, highlights: key.length > 1 ? [[key.length - 2, key.length - 1]] : void 0 };
	}
	return {
		label: itemLabel,
		tooltip,
		command: {
			"title": "Open patch",
			"command": "aifix4seccode-vscode.openUpFile",
			"arguments": [treeElement.patches[0].path],
		},
		collapsibleState: vscode.TreeItemCollapsibleState.None,
		iconPath: {
			light: path.join(__filename, '..', '..', '..', 'resources', 'icons', 'light', 'eye.svg'),
			dark: path.join(__filename, '..', '..', '..', 'resources', 'icons', 'dark', 'eye.svg')
		}
	};
}

function getTreeElement(element: any) {
	if (!isNaN(element)) {
		return undefined;
	}
	let parent = tree;
	parent = parent[element];
	if (!parent) {
		return element;
	}
	return parent;
}

function getNode(key: any): { key: string } {
	if (!nodes.includes(key)) {
		nodes.push(key);
	}
	return { key: nodes[nodes.indexOf(key)] };
}

function filterTree(patchPath: string) {
	Object.keys(tree).forEach(key => {
		if (tree[key].patches.some((x: any) => x.path === patchPath || patchPath.includes(x.path))) {
			delete tree[key];
		}
	});
	console.log(tree);
}

class Key {
	constructor(readonly key: string) { }
}