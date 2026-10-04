import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const processSecret = randomBytes(32).toString('hex');

export function createCsrfToken(secret = processSecret) {
	const nonce = randomBytes(32).toString('hex');
	const signature = createHmac('sha256', secret).update(nonce).digest('hex');
	return `${nonce}.${signature}`;
}

export function isValidCsrfToken(
	cookie: string | undefined,
	header: string | undefined,
	secret = processSecret,
) {
	if (!cookie || !header || cookie !== header) return false;
	const [nonce, signature, extra] = cookie.split('.');
	if (!nonce || !signature || extra) return false;
	const expected = createHmac('sha256', secret).update(nonce).digest('hex');
	const actualBuffer = Buffer.from(signature);
	const expectedBuffer = Buffer.from(expected);
	return (
		actualBuffer.length === expectedBuffer.length &&
		timingSafeEqual(actualBuffer, expectedBuffer)
	);
}
