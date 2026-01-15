/**
 * Firebase Admin Mock for testing
 */

import { vi } from 'vitest';

// Mock Firestore document data
const mockDocData: Record<string, Record<string, unknown>> = {};
const mockCollections: Record<string, unknown[]> = {};

// Mock document reference
const createMockDocRef = (collection: string, id: string) => ({
    id,
    get: vi.fn().mockImplementation(async () => ({
        exists: !!mockDocData[`${collection}/${id}`],
        id,
        data: () => mockDocData[`${collection}/${id}`] || null,
    })),
    set: vi.fn().mockImplementation(async (data, options) => {
        if (options?.merge) {
            mockDocData[`${collection}/${id}`] = {
                ...mockDocData[`${collection}/${id}`],
                ...data,
            };
        } else {
            mockDocData[`${collection}/${id}`] = data;
        }
    }),
    update: vi.fn().mockImplementation(async (data) => {
        mockDocData[`${collection}/${id}`] = {
            ...mockDocData[`${collection}/${id}`],
            ...data,
        };
    }),
    delete: vi.fn().mockImplementation(async () => {
        delete mockDocData[`${collection}/${id}`];
    }),
});

// Mock query
const createMockQuery = (collectionName: string) => ({
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    startAfter: vi.fn().mockReturnThis(),
    get: vi.fn().mockImplementation(async () => ({
        empty: !(mockCollections[collectionName]?.length > 0),
        docs: (mockCollections[collectionName] || []).map((doc, i) => ({
            id: (doc as Record<string, unknown>).id || `doc_${i}`,
            data: () => doc,
            ref: createMockDocRef(collectionName, (doc as Record<string, unknown>).id as string || `doc_${i}`),
        })),
        size: mockCollections[collectionName]?.length || 0,
    })),
});

// Mock collection reference
const createMockCollectionRef = (name: string) => ({
    doc: vi.fn((id?: string) => createMockDocRef(name, id || `auto_${Date.now()}`)),
    add: vi.fn().mockImplementation(async (data) => {
        const id = `auto_${Date.now()}`;
        mockDocData[`${name}/${id}`] = data;
        return createMockDocRef(name, id);
    }),
    where: vi.fn().mockReturnValue(createMockQuery(name)),
    orderBy: vi.fn().mockReturnValue(createMockQuery(name)),
    limit: vi.fn().mockReturnValue(createMockQuery(name)),
    get: vi.fn().mockImplementation(async () => ({
        empty: !(mockCollections[name]?.length > 0),
        docs: (mockCollections[name] || []).map((doc, i) => ({
            id: (doc as Record<string, unknown>).id || `doc_${i}`,
            data: () => doc,
        })),
    })),
});

// Mock Firestore
export const mockDb = {
    collection: vi.fn((name: string) => createMockCollectionRef(name)),
    doc: vi.fn((path: string) => {
        const [collection, id] = path.split('/');
        return createMockDocRef(collection, id);
    }),
    runTransaction: vi.fn(async (fn) => fn({
        get: vi.fn(),
        set: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    })),
    batch: vi.fn(() => ({
        set: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        commit: vi.fn().mockResolvedValue(undefined),
    })),
};

// Mock Auth
export const mockAuth = {
    verifyIdToken: vi.fn().mockResolvedValue({
        uid: 'test-user-id',
        email: 'test@example.com',
    }),
    createCustomToken: vi.fn().mockResolvedValue('mock-custom-token'),
    getUser: vi.fn().mockResolvedValue({
        uid: 'test-user-id',
        email: 'test@example.com',
        displayName: 'Test User',
    }),
    getUserByEmail: vi.fn().mockResolvedValue({
        uid: 'test-user-id',
        email: 'test@example.com',
    }),
    createUser: vi.fn().mockResolvedValue({
        uid: 'new-user-id',
        email: 'new@example.com',
    }),
    updateUser: vi.fn().mockResolvedValue(undefined),
    deleteUser: vi.fn().mockResolvedValue(undefined),
};

// Helper to set mock data
export const setMockDocData = (path: string, data: Record<string, unknown>) => {
    mockDocData[path] = data;
};

export const setMockCollection = (name: string, docs: unknown[]) => {
    mockCollections[name] = docs;
};

export const clearMockData = () => {
    Object.keys(mockDocData).forEach(key => delete mockDocData[key]);
    Object.keys(mockCollections).forEach(key => delete mockCollections[key]);
};

// Mock the firebaseAdmin module
vi.mock('@/lib/firebaseAdmin', () => ({
    dbAdmin: vi.fn(() => mockDb),
    authAdmin: vi.fn(() => mockAuth),
}));

export { mockDocData, mockCollections };
