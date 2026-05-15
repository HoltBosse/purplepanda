/// <reference types="astro/client" />

declare global {
    namespace App {
        interface Locals {
            alerts: import('./alert/index.js').Alert[];
        }
    }
}

export {};

