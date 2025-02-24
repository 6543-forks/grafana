import React, { CSSProperties } from 'react';
import { OnDrag, OnResize } from 'react-moveable/declaration/types';

import { LayerElement } from 'app/core/components/Layers/types';
import {
  BackgroundImageSize,
  CanvasElementItem,
  CanvasElementOptions,
  canvasElementRegistry,
} from 'app/features/canvas';
import { notFoundItem } from 'app/features/canvas/elements/notFound';
import { DimensionContext } from 'app/features/dimensions';

import { HorizontalConstraint, Placement, VerticalConstraint } from '../types';

import { FrameState } from './frame';
import { RootElement } from './root';
import { Scene } from './scene';

let counter = 0;

export class ElementState implements LayerElement {
  // UID necessary for moveable to work (for now)
  readonly UID = counter++;
  revId = 0;
  sizeStyle: CSSProperties = {};
  dataStyle: CSSProperties = {};

  // Determine whether or not element is in motion or not (via moveable)
  isMoving = false;

  // Filled in by ref
  div?: HTMLDivElement;

  // Calculated
  data?: any; // depends on the type

  constructor(public item: CanvasElementItem, public options: CanvasElementOptions, public parent?: FrameState) {
    const fallbackName = `Element ${Date.now()}`;
    if (!options) {
      this.options = { type: item.id, name: fallbackName };
    }

    options.constraint = options.constraint ?? {
      vertical: VerticalConstraint.Top,
      horizontal: HorizontalConstraint.Left,
    };
    options.placement = options.placement ?? { width: 100, height: 100, top: 0, left: 0 };
    const scene = this.getScene();
    if (!options.name) {
      const newName = scene?.getNextElementName();
      options.name = newName ?? fallbackName;
    }
    scene?.byName.set(options.name, this);
  }

  private getScene(): Scene | undefined {
    let trav = this.parent;
    while (trav) {
      if (trav.isRoot()) {
        return trav.scene;
      }
      trav = trav.parent;
    }

    return undefined;
  }

  getName() {
    return this.options.name;
  }

  /** Use the configured options to update CSS style properties directly on the wrapper div **/
  applyLayoutStylesToDiv() {
    if (this.isRoot()) {
      // Root supersedes layout engine and is always 100% width + height of panel
      return;
    }

    const { constraint } = this.options;
    const { vertical, horizontal } = constraint ?? {};
    const placement = this.options.placement ?? ({} as Placement);

    const style: React.CSSProperties = {
      position: 'absolute',
      // Minimum element size is 10x10
      minWidth: '10px',
      minHeight: '10px',
    };

    const translate = ['0px', '0px'];

    switch (vertical) {
      case VerticalConstraint.Top:
        placement.top = placement.top ?? 0;
        placement.height = placement.height ?? 100;
        style.top = `${placement.top}px`;
        style.height = `${placement.height}px`;
        delete placement.bottom;
        break;
      case VerticalConstraint.Bottom:
        placement.bottom = placement.bottom ?? 0;
        placement.height = placement.height ?? 100;
        style.bottom = `${placement.bottom}px`;
        style.height = `${placement.height}px`;
        delete placement.top;
        break;
      case VerticalConstraint.TopBottom:
        placement.top = placement.top ?? 0;
        placement.bottom = placement.bottom ?? 0;
        style.top = `${placement.top}px`;
        style.bottom = `${placement.bottom}px`;
        delete placement.height;
        break;
      case VerticalConstraint.Center:
        placement.top = placement.top ?? 0;
        placement.height = placement.height ?? 100;
        translate[1] = '-50%';
        style.top = `calc(50% - ${placement.top}px)`;
        style.height = `${placement.height}px`;
        delete placement.bottom;
        break;
      case VerticalConstraint.Scale:
        placement.top = placement.top ?? 0;
        placement.bottom = placement.bottom ?? 0;
        style.top = `${placement.top}%`;
        style.bottom = `${placement.bottom}%`;
        delete placement.height;
        break;
    }

    switch (horizontal) {
      case HorizontalConstraint.Left:
        placement.left = placement.left ?? 0;
        placement.width = placement.width ?? 100;
        style.left = `${placement.left}px`;
        style.width = `${placement.width}px`;
        delete placement.right;
        break;
      case HorizontalConstraint.Right:
        placement.right = placement.right ?? 0;
        placement.width = placement.width ?? 100;
        style.right = `${placement.right}px`;
        style.width = `${placement.width}px`;
        delete placement.left;
        break;
      case HorizontalConstraint.LeftRight:
        placement.left = placement.left ?? 0;
        placement.right = placement.right ?? 0;
        style.left = `${placement.left}px`;
        style.right = `${placement.right}px`;
        delete placement.width;
        break;
      case HorizontalConstraint.Center:
        placement.left = placement.left ?? 0;
        placement.width = placement.width ?? 100;
        translate[0] = '-50%';
        style.left = `calc(50% - ${placement.left}px)`;
        style.width = `${placement.width}px`;
        delete placement.right;
        break;
      case HorizontalConstraint.Scale:
        placement.left = placement.left ?? 0;
        placement.right = placement.right ?? 0;
        style.left = `${placement.left}%`;
        style.right = `${placement.right}%`;
        delete placement.width;
        break;
    }

    style.transform = `translate(${translate[0]}, ${translate[1]})`;
    this.options.placement = placement;
    this.sizeStyle = style;
    if (this.div) {
      for (const key in this.sizeStyle) {
        this.div.style[key as any] = (this.sizeStyle as any)[key];
      }

      for (const key in this.dataStyle) {
        this.div.style[key as any] = (this.dataStyle as any)[key];
      }
    }
  }

  setPlacementFromConstraint(elementContainer?: DOMRect, parentContainer?: DOMRect) {
    const { constraint } = this.options;
    const { vertical, horizontal } = constraint ?? {};

    if (!elementContainer) {
      elementContainer = this.div && this.div.getBoundingClientRect();
    }
    if (!parentContainer) {
      parentContainer = this.div && this.div.parentElement?.getBoundingClientRect();
    }

    const relativeTop =
      elementContainer && parentContainer ? Math.abs(Math.round(elementContainer.top - parentContainer.top)) : 0;
    const relativeBottom =
      elementContainer && parentContainer ? Math.abs(Math.round(elementContainer.bottom - parentContainer.bottom)) : 0;
    const relativeLeft =
      elementContainer && parentContainer ? Math.abs(Math.round(elementContainer.left - parentContainer.left)) : 0;
    const relativeRight =
      elementContainer && parentContainer ? Math.abs(Math.round(elementContainer.right - parentContainer.right)) : 0;

    const placement = {} as Placement;

    const width = elementContainer?.width ?? 100;
    const height = elementContainer?.height ?? 100;

    switch (vertical) {
      case VerticalConstraint.Top:
        placement.top = relativeTop;
        placement.height = height;
        break;
      case VerticalConstraint.Bottom:
        placement.bottom = relativeBottom;
        placement.height = height;
        break;
      case VerticalConstraint.TopBottom:
        placement.top = relativeTop;
        placement.bottom = relativeBottom;
        break;
      case VerticalConstraint.Center:
        const elementCenter = elementContainer ? relativeTop + height / 2 : 0;
        const parentCenter = parentContainer ? parentContainer.height / 2 : 0;
        const distanceFromCenter = parentCenter - elementCenter;
        placement.top = distanceFromCenter;
        placement.height = height;
        break;
      case VerticalConstraint.Scale:
        placement.top = (relativeTop / (parentContainer?.height ?? height)) * 100;
        placement.bottom = (relativeBottom / (parentContainer?.height ?? height)) * 100;
        break;
    }

    switch (horizontal) {
      case HorizontalConstraint.Left:
        placement.left = relativeLeft;
        placement.width = width;
        break;
      case HorizontalConstraint.Right:
        placement.right = relativeRight;
        placement.width = width;
        break;
      case HorizontalConstraint.LeftRight:
        placement.left = relativeLeft;
        placement.right = relativeRight;
        break;
      case HorizontalConstraint.Center:
        const elementCenter = elementContainer ? relativeLeft + width / 2 : 0;
        const parentCenter = parentContainer ? parentContainer.width / 2 : 0;
        const distanceFromCenter = parentCenter - elementCenter;
        placement.left = distanceFromCenter;
        placement.width = width;
        break;
      case HorizontalConstraint.Scale:
        placement.left = (relativeLeft / (parentContainer?.width ?? width)) * 100;
        placement.right = (relativeRight / (parentContainer?.width ?? width)) * 100;
        break;
    }

    this.options.placement = placement;

    this.applyLayoutStylesToDiv();
    this.revId++;
  }

  updateData(ctx: DimensionContext) {
    if (this.item.prepareData) {
      this.data = this.item.prepareData(ctx, this.options.config);
      this.revId++; // rerender
    }

    const { background, border } = this.options;
    const css: CSSProperties = {};
    if (background) {
      if (background.color) {
        const color = ctx.getColor(background.color);
        css.backgroundColor = color.value();
      }
      if (background.image) {
        const image = ctx.getResource(background.image);
        if (image) {
          const v = image.value();
          if (v) {
            css.backgroundImage = `url("${v}")`;
            switch (background.size ?? BackgroundImageSize.Contain) {
              case BackgroundImageSize.Contain:
                css.backgroundSize = 'contain';
                css.backgroundRepeat = 'no-repeat';
                break;
              case BackgroundImageSize.Cover:
                css.backgroundSize = 'cover';
                css.backgroundRepeat = 'no-repeat';
                break;
              case BackgroundImageSize.Original:
                css.backgroundRepeat = 'no-repeat';
                break;
              case BackgroundImageSize.Tile:
                css.backgroundRepeat = 'repeat';
                break;
              case BackgroundImageSize.Fill:
                css.backgroundSize = '100% 100%';
                break;
            }
          }
        }
      }
    }

    if (border && border.color && border.width) {
      const color = ctx.getColor(border.color);
      css.borderWidth = border.width;
      css.borderStyle = 'solid';
      css.borderColor = color.value();

      // Move the image to inside the border
      if (css.backgroundImage) {
        css.backgroundOrigin = 'padding-box';
      }
    }

    this.dataStyle = css;
    this.applyLayoutStylesToDiv();
  }

  isRoot(): this is RootElement {
    return false;
  }

  /** Recursively visit all nodes */
  visit(visitor: (v: ElementState) => void) {
    visitor(this);
  }

  onChange(options: CanvasElementOptions) {
    if (this.item.id !== options.type) {
      this.item = canvasElementRegistry.getIfExists(options.type) ?? notFoundItem;
    }

    // rename handling
    const oldName = this.options.name;
    const newName = options.name;

    this.revId++;
    this.options = { ...options };
    let trav = this.parent;
    while (trav) {
      if (trav.isRoot()) {
        trav.scene.save();
        break;
      }
      trav.revId++;
      trav = trav.parent;
    }

    const scene = this.getScene();
    if (oldName !== newName && scene) {
      scene.byName.delete(oldName);
      scene.byName.set(newName, this);
    }
  }

  getSaveModel() {
    return { ...this.options };
  }

  initElement = (target: HTMLDivElement) => {
    this.div = target;
    this.applyLayoutStylesToDiv();
  };

  applyDrag = (event: OnDrag) => {
    event.target.style.transform = event.transform;
  };

  // kinda like:
  // https://github.com/grafana/grafana-edge-app/blob/main/src/panels/draw/WrapItem.tsx#L44
  applyResize = (event: OnResize) => {
    const { options } = this;
    const { placement, constraint } = options;
    const { vertical, horizontal } = constraint ?? {};

    const top = vertical === VerticalConstraint.Top || vertical === VerticalConstraint.TopBottom;
    const bottom = vertical === VerticalConstraint.Bottom || vertical === VerticalConstraint.TopBottom;
    const left = horizontal === HorizontalConstraint.Left || horizontal === HorizontalConstraint.LeftRight;
    const right = horizontal === HorizontalConstraint.Right || horizontal === HorizontalConstraint.LeftRight;

    const style = event.target.style;
    const deltaX = event.delta[0];
    const deltaY = event.delta[1];
    const dirLR = event.direction[0];
    const dirTB = event.direction[1];
    if (dirLR === 1) {
      // RIGHT
      if (right) {
        placement!.right! -= deltaX;
        style.right = `${placement!.right}px`;
        if (!left) {
          placement!.width = event.width;
          style.width = `${placement!.width}px`;
        }
      } else {
        placement!.width! = event.width;
        style.width = `${placement!.width}px`;
      }
    } else if (dirLR === -1) {
      // LEFT
      if (left) {
        placement!.left! -= deltaX;
        placement!.width! = event.width;
        style.left = `${placement!.left}px`;
        style.width = `${placement!.width}px`;
      } else {
        placement!.width! += deltaX;
        style.width = `${placement!.width}px`;
      }
    }

    if (dirTB === -1) {
      // TOP
      if (top) {
        placement!.top! -= deltaY;
        placement!.height = event.height;
        style.top = `${placement!.top}px`;
        style.height = `${placement!.height}px`;
      } else {
        placement!.height = event.height;
        style.height = `${placement!.height}px`;
      }
    } else if (dirTB === 1) {
      // BOTTOM
      if (bottom) {
        placement!.bottom! -= deltaY;
        placement!.height! = event.height;
        style.bottom = `${placement!.bottom}px`;
        style.height = `${placement!.height}px`;
      } else {
        placement!.height! = event.height;
        style.height = `${placement!.height}px`;
      }
    }
  };

  render() {
    const { item } = this;
    return (
      <div key={this.UID} ref={this.initElement}>
        <item.display key={`${this.UID}/${this.revId}`} config={this.options.config} data={this.data} />
      </div>
    );
  }
}
