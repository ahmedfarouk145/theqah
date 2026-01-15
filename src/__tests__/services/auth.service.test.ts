/**
 * AuthService Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthService } from '@/server/services/auth.service';

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
    default: {
        hash: vi.fn().mockResolvedValue('hashed_password_123'),
        compare: vi.fn().mockResolvedValue(true),
    },
}));

// Mock Firebase Admin
const mockDb = {
    collection: vi.fn(),
    runTransaction: vi.fn(),
};

const mockAuth = {
    verifyIdToken: vi.fn(),
    createSessionCookie: vi.fn(),
    verifySessionCookie: vi.fn(),
    revokeRefreshTokens: vi.fn(),
};

vi.mock('@/lib/firebaseAdmin', () => ({
    dbAdmin: () => mockDb,
    authAdmin: () => mockAuth,
}));

describe('AuthService', () => {
    let authService: AuthService;

    beforeEach(() => {
        authService = new AuthService();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('createSession', () => {
        it('should create a session cookie from valid ID token', async () => {
            mockAuth.verifyIdToken.mockResolvedValue({ uid: 'user-123', email: 'test@test.com' });
            mockAuth.createSessionCookie.mockResolvedValue('session-cookie-abc');

            const result = await authService.createSession('valid-id-token');

            expect(result).toEqual({
                sessionCookie: 'session-cookie-abc',
                uid: 'user-123',
            });
            expect(mockAuth.verifyIdToken).toHaveBeenCalledWith('valid-id-token');
        });

        it('should throw error for invalid ID token', async () => {
            mockAuth.verifyIdToken.mockRejectedValue(new Error('Invalid token'));

            await expect(authService.createSession('invalid-token')).rejects.toThrow('Invalid token');
        });
    });

    describe('verifySession', () => {
        it('should verify a valid session cookie', async () => {
            mockAuth.verifySessionCookie.mockResolvedValue({
                uid: 'user-123',
                email: 'test@test.com',
            });

            const result = await authService.verifySession('valid-session-cookie');

            expect(result).toEqual({
                uid: 'user-123',
                email: 'test@test.com',
            });
        });

        it('should return null email when not present', async () => {
            mockAuth.verifySessionCookie.mockResolvedValue({
                uid: 'user-123',
            });

            const result = await authService.verifySession('valid-session-cookie');

            expect(result.email).toBeNull();
        });
    });

    describe('verifySetupToken', () => {
        it('should return invalid for non-existent token', async () => {
            mockDb.collection.mockReturnValue({
                doc: vi.fn().mockReturnValue({
                    get: vi.fn().mockResolvedValue({ exists: false }),
                }),
            });

            const result = await authService.verifySetupToken('invalid-token');

            expect(result.valid).toBe(false);
            expect(result.message).toBe('رابط غير صحيح');
        });

        it('should return invalid for expired token', async () => {
            mockDb.collection.mockReturnValue({
                doc: vi.fn().mockReturnValue({
                    get: vi.fn().mockResolvedValue({
                        exists: true,
                        data: () => ({
                            email: 'test@test.com',
                            storeUid: 'store-123',
                            expiresAt: Date.now() - 1000, // Expired
                            used: false,
                        }),
                    }),
                }),
            });

            const result = await authService.verifySetupToken('expired-token');

            expect(result.valid).toBe(false);
            expect(result.message).toBe('انتهت صلاحية الرابط');
        });

        it('should return invalid for already used token', async () => {
            mockDb.collection.mockReturnValue({
                doc: vi.fn().mockReturnValue({
                    get: vi.fn().mockResolvedValue({
                        exists: true,
                        data: () => ({
                            email: 'test@test.com',
                            storeUid: 'store-123',
                            expiresAt: Date.now() + 100000,
                            used: true,
                        }),
                    }),
                }),
            });

            const result = await authService.verifySetupToken('used-token');

            expect(result.valid).toBe(false);
            expect(result.message).toBe('تم استخدام هذا الرابط من قبل');
        });

        it('should return valid for active token', async () => {
            const mockTokenDoc = {
                exists: true,
                data: () => ({
                    email: 'test@test.com',
                    storeUid: 'store-123',
                    expiresAt: Date.now() + 100000,
                    used: false,
                }),
            };

            const mockStoreDoc = {
                exists: true,
                data: () => ({ name: 'Test Store' }),
            };

            mockDb.collection.mockImplementation((name: string) => ({
                doc: vi.fn().mockReturnValue({
                    get: vi.fn().mockResolvedValue(
                        name === 'setup_tokens' ? mockTokenDoc : mockStoreDoc
                    ),
                }),
            }));

            const result = await authService.verifySetupToken('valid-token');

            expect(result.valid).toBe(true);
            expect(result.email).toBe('test@test.com');
            expect(result.storeName).toBe('Test Store');
        });
    });

    describe('setupPassword', () => {
        it('should reject empty token or password', async () => {
            const result1 = await authService.setupPassword('', 'password123');
            expect(result1.success).toBe(false);
            expect(result1.message).toBe('التوكن وكلمة المرور مطلوبان');

            const result2 = await authService.setupPassword('token', '');
            expect(result2.success).toBe(false);
            expect(result2.message).toBe('التوكن وكلمة المرور مطلوبان');
        });

        it('should reject password shorter than 8 characters', async () => {
            const result = await authService.setupPassword('token', 'short');
            expect(result.success).toBe(false);
            expect(result.message).toBe('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
        });

        it('should reject non-existent token', async () => {
            mockDb.collection.mockReturnValue({
                doc: vi.fn().mockReturnValue({
                    get: vi.fn().mockResolvedValue({ exists: false }),
                }),
            });

            const result = await authService.setupPassword('invalid-token', 'password123');

            expect(result.success).toBe(false);
            expect(result.message).toBe('رابط غير صحيح');
        });
    });
});
