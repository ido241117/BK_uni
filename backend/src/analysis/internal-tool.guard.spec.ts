import { generateKeyPairSync, sign } from 'crypto';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { verifyDelegatedAssertion } from './internal-tool.guard';

const correlationId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const profileId = '00000000-0000-4000-8000-000000000003';

function signedToken(overrides: Record<string, unknown> = {}) {
	const { publicKey, privateKey } = generateKeyPairSync('ed25519');
	const encode = (value: object) =>
		Buffer.from(JSON.stringify(value)).toString('base64url');
	const header = encode({ alg: 'EdDSA', typ: 'JWT' });
	const now = Math.floor(Date.now() / 1000);
	const payload = encode({
		iss: 'bk-nest',
		aud: 'bk-recommendation-tool',
		sub: userId,
		profile_id: profileId,
		scope: 'recommendation:read',
		correlation_id: correlationId,
		data_classification: 'synthetic',
		iat: now,
		exp: now + 60,
		...overrides,
	});
	const content = `${header}.${payload}`;
	const signature = sign(null, Buffer.from(content), privateKey).toString('base64url');
	return {
		publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
		token: `${content}.${signature}`,
	};
}

describe('verifyDelegatedAssertion', () => {
	it('accepts a valid synthetic recommendation context', () => {
		const { publicKey, token } = signedToken();

		expect(verifyDelegatedAssertion(token, publicKey, correlationId)).toMatchObject({
			sub: userId,
			profile_id: profileId,
			data_classification: 'synthetic',
		});
	});

	it('rejects a non-synthetic context', () => {
		const { publicKey, token } = signedToken({ data_classification: 'student' });

		expect(() => verifyDelegatedAssertion(token, publicKey, correlationId)).toThrow(
			ForbiddenException,
		);
	});

	it('rejects a mismatched correlation ID', () => {
		const { publicKey, token } = signedToken();

		expect(() =>
			verifyDelegatedAssertion(
				token,
				publicKey,
				'00000000-0000-4000-8000-000000000004',
			),
		).toThrow(UnauthorizedException);
	});

	it('rejects tampered claims', () => {
		const { publicKey, token } = signedToken();
		const [header, encodedPayload, signature] = token.split('.');
		const payload = JSON.parse(
			Buffer.from(encodedPayload, 'base64url').toString('utf8'),
		) as Record<string, unknown>;
		payload.sub = profileId;
		const tampered = `${header}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${signature}`;

		expect(() => verifyDelegatedAssertion(tampered, publicKey, correlationId)).toThrow(
			UnauthorizedException,
		);
	});
});