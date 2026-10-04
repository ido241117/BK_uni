import { createCsrfToken, isValidCsrfToken } from './csrf.util';

describe('CSRF token', () => {
	const secret = 'unit-test-secret';

	it('accepts the signed token submitted by the cookie and header', () => {
		const token = createCsrfToken(secret);
		expect(isValidCsrfToken(token, token, secret)).toBe(true);
	});

	it('rejects a mismatched header, altered signature, or different secret', () => {
		const token = createCsrfToken(secret);
		const [nonce, signature] = token.split('.');

		expect(isValidCsrfToken(token, `${token}x`, secret)).toBe(false);
		expect(
			isValidCsrfToken(
				`${nonce}.${signature.slice(1)}`,
				`${nonce}.${signature.slice(1)}`,
				secret,
			),
		).toBe(false);
		expect(isValidCsrfToken(token, token, 'other-secret')).toBe(false);
	});
});
