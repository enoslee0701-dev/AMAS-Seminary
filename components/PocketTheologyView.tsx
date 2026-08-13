// Re-export shim — the real implementation now lives under ./PocketTheology/.
// Splitting was a behaviour-preserving refactor; consumers should keep their
// existing import path ('./components/PocketTheologyView').
export { default } from './PocketTheology/PocketTheologyView';

