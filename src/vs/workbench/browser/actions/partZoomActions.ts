/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../platform/actions/common/actions.js';
import { Categories } from '../../../platform/action/common/actionCommonCategories.js';
import { KeyCode, KeyMod } from '../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../platform/keybinding/common/keybindingsRegistry.js';
import { ServicesAccessor } from '../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchLayoutService, Parts } from '../../services/layout/browser/layoutService.js';

const PART_ZOOM_STEP = 0.1; // 10% per step
const MIN_PART_ZOOM = 0.5;  // 50%
const MAX_PART_ZOOM = 3.0;  // 300%

/**
 * Get the focused part (excluding titlebar and statusbar since those are typically
 * not useful to zoom independently).
 */
function getFocusedZoomablePart(layoutService: IWorkbenchLayoutService): Parts | undefined {
	const zoomableParts: Parts[] = [
		Parts.EDITOR_PART,
		Parts.SIDEBAR_PART,
		Parts.PANEL_PART,
		Parts.AUXILIARYBAR_PART,
	];

	for (const part of zoomableParts) {
		if (layoutService.hasFocus(part)) {
			return part;
		}
	}

	return undefined;
}

function clampZoom(factor: number): number {
	factor = Math.min(Math.max(factor, MIN_PART_ZOOM), MAX_PART_ZOOM);
	return Math.round(factor * 100) / 100;
}

class PartZoomInAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.partZoomIn',
			title: localize2('partZoomIn', "Zoom In (Focused Part)"),
			category: Categories.View,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.Equal,
				secondary: [KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.NumpadAdd]
			},
			menu: {
				id: MenuId.MenubarAppearanceMenu,
				group: '5_zoom',
				order: 5
			}
		});
	}

	override run(accessor: ServicesAccessor): void {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const focusedPart = getFocusedZoomablePart(layoutService);
		if (!focusedPart) {
			return;
		}

		const currentZoom = layoutService.getPartZoomFactor(focusedPart);
		const newZoom = clampZoom(currentZoom + PART_ZOOM_STEP);
		layoutService.setPartZoomFactor(focusedPart, newZoom);
	}
}

class PartZoomOutAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.partZoomOut',
			title: localize2('partZoomOut', "Zoom Out (Focused Part)"),
			category: Categories.View,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.Minus,
				secondary: [KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.NumpadSubtract]
			},
			menu: {
				id: MenuId.MenubarAppearanceMenu,
				group: '5_zoom',
				order: 6
			}
		});
	}

	override run(accessor: ServicesAccessor): void {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const focusedPart = getFocusedZoomablePart(layoutService);
		if (!focusedPart) {
			return;
		}

		const currentZoom = layoutService.getPartZoomFactor(focusedPart);
		const newZoom = clampZoom(currentZoom - PART_ZOOM_STEP);
		layoutService.setPartZoomFactor(focusedPart, newZoom);
	}
}

class PartZoomResetAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.partZoomReset',
			title: localize2('partZoomReset', "Reset Zoom (Focused Part)"),
			category: Categories.View,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.Digit0,
				secondary: [KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.Numpad0]
			},
			menu: {
				id: MenuId.MenubarAppearanceMenu,
				group: '5_zoom',
				order: 7
			}
		});
	}

	override run(accessor: ServicesAccessor): void {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const focusedPart = getFocusedZoomablePart(layoutService);
		if (!focusedPart) {
			return;
		}

		layoutService.setPartZoomFactor(focusedPart, 1.0);
	}
}

registerAction2(PartZoomInAction);
registerAction2(PartZoomOutAction);
registerAction2(PartZoomResetAction);
