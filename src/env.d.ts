/// <reference types="astro/client" />
/// <reference types="node" />

declare global {
    namespace App {
        interface Locals {
            alerts: import('./alert/index.js').Alert[];
            // The tenant this request's hostname resolved to (set by the middleware for every
            // request it lets through). The same value getTenant() returns.
            tenant: import('./tenant/context.js').TenantContext;
        }
    }
}

export {};

