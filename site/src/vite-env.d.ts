/// <reference types="vite/client" />

/** Build-time engine version (short git SHA), injected by a Vite `define`. Used
 *  to namespace the persistent grade-cache so an engine change invalidates it.
 *  See site/vite.engine-version.ts. */
declare const __ENGINE_V__: string;
