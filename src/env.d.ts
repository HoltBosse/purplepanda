/// <reference types="astro/client" />
/// <reference types="node" />

declare global {
    namespace App {
        interface Locals {
            alerts: import('./alert/index.js').Alert[];
        }
    }
}

export {};

