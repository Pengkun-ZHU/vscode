/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/part.css';
import { Component } from '../common/component.js';
import { IThemeService, IColorTheme } from '../../platform/theme/common/themeService.js';
import { Dimension, size, IDimension, getActiveDocument, prepend, IDomPosition } from '../../base/browser/dom.js';
import { IStorageService } from '../../platform/storage/common/storage.js';
import { ISerializableView, IViewSize } from '../../base/browser/ui/grid/grid.js';
import { Event, Emitter } from '../../base/common/event.js';
import { IWorkbenchLayoutService } from '../services/layout/browser/layoutService.js';
import { assertReturnsDefined } from '../../base/common/types.js';
import { IDisposable, toDisposable } from '../../base/common/lifecycle.js';

export interface IPartOptions {
	readonly hasTitle?: boolean;
	readonly borderWidth?: () => number;
}

export interface ILayoutContentResult {
	readonly headerSize: IDimension;
	readonly titleSize: IDimension;
	readonly contentSize: IDimension;
	readonly footerSize: IDimension;
}

/**
 * Parts are layed out in the workbench and have their own layout that
 * arranges an optional title and mandatory content area to show content.
 */
export abstract class Part<MementoType extends object = object> extends Component<MementoType> implements ISerializableView {

	private _dimension: Dimension | undefined;
	get dimension(): Dimension | undefined { return this._dimension; }

	private _contentPosition: IDomPosition | undefined;
	get contentPosition(): IDomPosition | undefined { return this._contentPosition; }

	protected _onDidVisibilityChange = this._register(new Emitter<boolean>());
	readonly onDidVisibilityChange = this._onDidVisibilityChange.event;

	private _zoomFactor: number = 1;
	get zoomFactor(): number { return this._zoomFactor; }

	private parent: HTMLElement | undefined;
	private headerArea: HTMLElement | undefined;
	protected titleArea: HTMLElement | undefined;
	protected contentArea: HTMLElement | undefined;
	private footerArea: HTMLElement | undefined;
	private partLayout: PartLayout | undefined;

	constructor(
		id: string,
		protected options: IPartOptions,
		themeService: IThemeService,
		storageService: IStorageService,
		protected readonly layoutService: IWorkbenchLayoutService
	) {
		super(id, themeService, storageService);

		this._register(layoutService.registerPart(this));
	}

	protected override onThemeChange(theme: IColorTheme): void {

		// only call if our create() method has been called
		if (this.parent) {
			super.onThemeChange(theme);
		}
	}

	/**
	 * Note: Clients should not call this method, the workbench calls this
	 * method. Calling it otherwise may result in unexpected behavior.
	 *
	 * Called to create title and content area of the part.
	 */
	create(parent: HTMLElement, options?: object): void {
		this.parent = parent;
		this.titleArea = this.createTitleArea(parent, options);
		this.contentArea = this.createContentArea(parent, options);

		this.partLayout = new PartLayout(this.options, this.contentArea);

		this.updateStyles();
	}

	/**
	 * Returns the overall part container.
	 */
	getContainer(): HTMLElement | undefined {
		return this.parent;
	}

	/**
	 * Subclasses override to provide a title area implementation.
	 */
	protected createTitleArea(parent: HTMLElement, options?: object): HTMLElement | undefined {
		return undefined;
	}

	/**
	 * Subclasses override to provide a content area implementation.
	 */
	protected createContentArea(parent: HTMLElement, options?: object): HTMLElement | undefined {
		return undefined;
	}

	protected setHeaderArea(headerContainer: HTMLElement): void {
		if (this.headerArea) {
			throw new Error('Header already exists');
		}

		if (!this.parent || !this.titleArea) {
			return;
		}

		prepend(this.parent, headerContainer);
		headerContainer.classList.add('header-or-footer');
		headerContainer.classList.add('header');

		this.headerArea = headerContainer;
		this.partLayout?.setHeaderVisibility(true);
		this.relayout();
	}

	protected setFooterArea(footerContainer: HTMLElement): void {
		if (this.footerArea) {
			throw new Error('Footer already exists');
		}

		if (!this.parent || !this.titleArea) {
			return;
		}

		this.parent.appendChild(footerContainer);
		footerContainer.classList.add('header-or-footer');
		footerContainer.classList.add('footer');

		this.footerArea = footerContainer;
		this.partLayout?.setFooterVisibility(true);
		this.relayout();
	}

	protected removeHeaderArea(): void {
		if (this.headerArea) {
			this.headerArea.remove();
			this.headerArea = undefined;
			this.partLayout?.setHeaderVisibility(false);
			this.relayout();
		}
	}

	protected removeFooterArea(): void {
		if (this.footerArea) {
			this.footerArea.remove();
			this.footerArea = undefined;
			this.partLayout?.setFooterVisibility(false);
			this.relayout();
		}
	}

	private relayout() {
		if (this.dimension && this.contentPosition) {
			this.layout(this.dimension.width, this.dimension.height, this.contentPosition.top, this.contentPosition.left);
		}
	}
	/**
	 * Sets the zoom factor for this part. The content area will be laid out
	 * at expanded dimensions (physical / zoom) and then scaled back via
	 * CSS transform, replicating the behavior of global browser zoom but
	 * scoped to this part's content area.
	 */
	setZoomFactor(factor: number): void {
		console.log(`[Part.setZoomFactor] Setting zoom for ${this.constructor.name} to ${factor}`);
		this._zoomFactor = factor;

		// Step 1: Remove any existing zoom/transform so that all DOM measurements
		// during the layout pass (getBoundingClientRect, getComputedStyle, etc.)
		// reflect the true unzoomed coordinate system.
		if (this.contentArea) {
			this.contentArea.style.zoom = '';
			this.contentArea.style.transform = '';
			// Force a synchronous reflow to flush the zoom removal. Without
			// this, the browser may batch style changes and subsequent layout
			// measurements inside relayout() could still see stale values.
			this.contentArea.offsetHeight;
		}

		// Step 2: Perform the full layout pass. The content area will be sized
		// at expanded dimensions (physical / zoom). All internal components
		// (SplitViews, terminals, editors) measure and size themselves in
		// the unzoomed context.
		this.relayout();

		// Step 3: Apply zoom via CSS transform or zoom property. transform: scale()
		// generally works better with canvas-based content like xterm, while zoom
		// affects flow contribution. We use zoom for better layout behavior.
		// The expanded pixel dimensions set above are visually scaled to match
		// the physical allocation.
		if (this.contentArea && factor !== 1) {
			this.contentArea.style.zoom = `${factor}`;
			console.log(`[Part.setZoomFactor] Applied CSS zoom: ${factor}`);
			// Force a reflow to ensure zoom is applied before any subsequent operations
			this.contentArea.offsetHeight;
		}
	}

	/**
	 * Layout title and content area in the given dimension.
	 */
	protected layoutContents(width: number, height: number): ILayoutContentResult {
		const partLayout = assertReturnsDefined(this.partLayout);

		return partLayout.layout(width, height, this._zoomFactor);
	}

	//#region ISerializableView

	protected _onDidChange = this._register(new Emitter<IViewSize | undefined>());
	get onDidChange(): Event<IViewSize | undefined> { return this._onDidChange.event; }

	element!: HTMLElement;

	abstract minimumWidth: number;
	abstract maximumWidth: number;
	abstract minimumHeight: number;
	abstract maximumHeight: number;

	layout(width: number, height: number, top: number, left: number): void {
		this._dimension = new Dimension(width, height);
		this._contentPosition = { top, left };
	}

	setVisible(visible: boolean) {
		this._onDidVisibilityChange.fire(visible);
	}

	abstract toJSON(): object;

	//#endregion
}

class PartLayout {

	private static readonly HEADER_HEIGHT = 35;
	private static readonly TITLE_HEIGHT = 35;
	private static readonly Footer_HEIGHT = 35;

	private headerVisible: boolean = false;
	private footerVisible: boolean = false;

	constructor(private options: IPartOptions, private contentArea: HTMLElement | undefined) { }

	layout(width: number, height: number, zoomFactor: number = 1): ILayoutContentResult {

		// Title Size: Width (Fill), Height (Variable)
		let titleSize: Dimension;
		if (this.options.hasTitle) {
			titleSize = new Dimension(width, Math.min(height, PartLayout.TITLE_HEIGHT));
		} else {
			titleSize = Dimension.None;
		}

		// Header Size: Width (Fill), Height (Variable)
		let headerSize: Dimension;
		if (this.headerVisible) {
			headerSize = new Dimension(width, Math.min(height, PartLayout.HEADER_HEIGHT));
		} else {
			headerSize = Dimension.None;
		}

		// Footer Size: Width (Fill), Height (Variable)
		let footerSize: Dimension;
		if (this.footerVisible) {
			footerSize = new Dimension(width, Math.min(height, PartLayout.Footer_HEIGHT));
		} else {
			footerSize = Dimension.None;
		}

		let contentWidth = width;
		if (this.options && typeof this.options.borderWidth === 'function') {
			contentWidth -= this.options.borderWidth(); // adjust for border size
		}

		// Content Size: Width (Fill), Height (Variable)
		const physicalContentHeight = height - titleSize.height - headerSize.height - footerSize.height;

		// When zoomed, expand content dimensions so that after transform: scale(zoom)
		// the visual size matches the physical allocation.
		let contentSize: Dimension;
		if (zoomFactor !== 1) {
			contentSize = new Dimension(
				Math.round(contentWidth / zoomFactor),
				Math.round(physicalContentHeight / zoomFactor)
			);
		} else {
			contentSize = new Dimension(contentWidth, physicalContentHeight);
		}

		// Content
		if (this.contentArea) {
			size(this.contentArea, contentSize.width, contentSize.height);
		}

		return { headerSize, titleSize, contentSize, footerSize };
	}

	setFooterVisibility(visible: boolean): void {
		this.footerVisible = visible;
	}

	setHeaderVisibility(visible: boolean): void {
		this.headerVisible = visible;
	}
}

export interface IMultiWindowPart {
	readonly element: HTMLElement;
}

export abstract class MultiWindowParts<T extends IMultiWindowPart, MementoType extends object = object> extends Component<MementoType> {

	protected readonly _parts = new Set<T>();
	get parts() { return Array.from(this._parts); }

	abstract readonly mainPart: T;

	registerPart(part: T): IDisposable {
		this._parts.add(part);

		return toDisposable(() => this.unregisterPart(part));
	}

	protected unregisterPart(part: T): void {
		this._parts.delete(part);
	}

	getPart(container: HTMLElement): T {
		return this.getPartByDocument(container.ownerDocument);
	}

	protected getPartByDocument(document: Document): T {
		if (this._parts.size > 1) {
			for (const part of this._parts) {
				if (part.element?.ownerDocument === document) {
					return part;
				}
			}
		}

		return this.mainPart;
	}

	get activePart(): T {
		return this.getPartByDocument(getActiveDocument());
	}
}
