import { test, expect } from '@playwright/test';

test.describe('SPQE Agent Gateway - Production E2E Tests', () => {

    // -------------
    // UI Validation
    // -------------
    test('Swagger UI should load correctly in production', async ({ page }) => {
        // Navigate to the Swagger UI docs
        const response = await page.goto('/api/docs');

        // Validate successful page load
        expect(response?.status()).toBe(200);

        // Validate UI content exists
        await expect(page).toHaveTitle(/Swagger UI|SPQE Agent Gateway/i);

        // Wait for the Swagger UI to render and check for the main title
        const titleElement = page.locator('.title', { hasText: 'SPQE Agent Gateway' });
        await expect(titleElement).toBeVisible({ timeout: 10000 });

        // Validate that our endpoints are documented in the UI
        const validateEndpoint = page.locator('.opblock-summary-path', { hasText: '/api/validate' });
        const healthEndpoint = page.locator('.opblock-summary-path', { hasText: '/api/health' });

        await expect(validateEndpoint).toBeVisible();
        await expect(healthEndpoint).toBeVisible();
    });

    // --------------------
    // Functional Validation
    // --------------------
    test('Health check endpoint should return 200 OK', async ({ request }) => {
        const response = await request.get('/api/health');
        expect(response.status()).toBe(200);

        const body = await response.json();
        expect(body.status).toBe('ok');
        expect(body).toHaveProperty('version');
    });

    test('Validate intent endpoint should operate in fail-closed mode without enclave', async ({ request }) => {
        /* 
         * Functional test:
         * Railway environment does not have the AWS Nitro Enclave running by default
         * (the enclave is heavily protected and runs in AWS).
         * Therefore, the expected secure behavior is that the gateway MUST FAIL-CLOSED
         * and deny the transaction intent, since the enclave cannot co-sign.
         */

        const startTime = performance.now();
        const response = await request.post('/api/validate', {
            data: {
                action: 'transfer',
                target: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin',
                amount: 1000000,
                agent_id: 'e2e-test-agent',
                memo: 'E2E Test Transfer',
                nonce: "test-nonce-123",
                timestamp_ms: Date.now()
            }
        });

        expect(response.status()).toBe(200); // The API itself did not crash

        const body = await response.json();
        const latency = performance.now() - startTime;

        // 1. Must be denied (fail closed semantics)
        expect(body.approved).toBe(false);

        // 2. No signature should be released
        expect(body.pq_signature).toBeNull();

        // 3. Reasoning should indicate network issue/fail closed
        expect(body.reasoning.toLowerCase()).toContain('fail-closed');

        // 4. Validate latency tracking is present
        expect(body.latency_ms).toBeGreaterThanOrEqual(0);

        // We expect this timeout/failure to happen safely and be logged
        console.log(`[E2E] Fail-closed validation took ${Math.round(latency)}ms`);
    });

    test('Validate endpoint should reject invalid payload schema', async ({ request }) => {
        // Missing required fields (e.g. amount)
        const response = await request.post('/api/validate', {
            data: {
                action: 'transfer',
                target: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'
                // amount is missing
            }
        });

        // Fastify/JSON schema validation should intercept this automatically
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body).toHaveProperty('error');
        expect(body.message).toContain("required property 'amount'");
    });
});
