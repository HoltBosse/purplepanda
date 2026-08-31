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
export declare const CircleCheck: AstroComponent;
export declare const Circlex: AstroComponent;
export declare const CircleCheckBig: AstroComponent;
export declare const House: AstroComponent;
export declare const Users: AstroComponent;
export declare const LayoutTemplate: AstroComponent;
export declare const FileText: AstroComponent;
export declare const PenLine: AstroComponent;
export declare const ClipboardList: AstroComponent;
export declare const Images: AstroComponent;
export declare const LogOut: AstroComponent;
export declare const Folder: AstroComponent;
export declare const Settings: AstroComponent;
export declare const ExternalLink: AstroComponent;
export declare const EllipsisVertical: AstroComponent;
export declare const FilePen: AstroComponent;
export declare const Trash2: AstroComponent;
export declare const GitBranch: AstroComponent;
export declare const CornerDownRight: AstroComponent;
export declare const Eye: AstroComponent;
export declare const EyeOff: AstroComponent;
export declare const Activity: AstroComponent;
export declare const UserRound: AstroComponent;
export declare const ChartPie: AstroComponent;
export declare const Database: AstroComponent;
export declare const Plus: AstroComponent;
export declare const FileStack: AstroComponent;
export declare const Tags: AstroComponent;
export declare const Link2: AstroComponent;
export declare const Shapes: AstroComponent;
export declare const Inbox: AstroComponent;
export declare const SquareArrowOutUpRight: AstroComponent;
export declare const SquarePen: AstroComponent;
export declare const Timer: AstroComponent;
