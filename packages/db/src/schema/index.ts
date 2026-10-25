// Drizzle schema barrel. drizzle.config.ts points its `schema` field here.
// Tables are grouped by domain; sub-barrels keep every folder under ten files.
export * from './enums';
export * from './core';
export * from './market';
export * from './ai';
export * from './ops';
