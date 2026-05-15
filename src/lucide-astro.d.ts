/**
 * Local type shim for @lucide/astro.
 * tsc cannot process the package's raw source because it imports .astro files.
 * This file is referenced via tsconfig "paths" to avoid that resolution.
 */

export type AstroComponent = (_props: IconProps) => any;

export interface IconProps {
    color?: string;
    size?: number | string;
    'stroke-width'?: number | string;
    absoluteStrokeWidth?: boolean;
    class?: string;
    iconNode?: IconNode;
    title?: string;
    [key: string]: unknown;
}

export type SVGAttributes = { [key: string]: unknown };
export type IconNode = [elementName: string, attrs: SVGAttributes][];

export declare const createLucideIcon: (...args: unknown[]) => AstroComponent;
export declare const defaultAttributes: Record<string, unknown>;

// Icons – extend this list as new icons are imported across the package
export declare const Info: AstroComponent;
export declare const TriangleAlert: AstroComponent;
export declare const CircleX: AstroComponent;
export declare const CircleCheckBig: AstroComponent;
export declare const House: AstroComponent;
export declare const Users: AstroComponent;
export declare const LayoutTemplate: AstroComponent;
export declare const FileText: AstroComponent;
export declare const PenLine: AstroComponent;
export declare const ClipboardList: AstroComponent;
export declare const Images: AstroComponent;
export declare const LogOut: AstroComponent;
