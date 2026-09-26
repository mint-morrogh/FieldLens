import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

// jsdom doesn't implement object URLs.
let objectUrlCounter = 0;
URL.createObjectURL = () => `blob:test/${++objectUrlCounter}`;
URL.revokeObjectURL = () => undefined;
