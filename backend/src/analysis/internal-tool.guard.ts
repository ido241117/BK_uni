import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicKey, timingSafeEqual, verify } from 'crypto';
import type { Request } from 'express';

export interface DelegatedContext {
	sub: string;
	profile_id: string;
	scope: 'recommendation:read';
	correlation_id: string;
	data_classification: 'synthetic';
}

export interface InternalToolRequest extends Request {
	delegatedContext?: DelegatedContext;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function verifyDelegatedAssertion(
	token: string,
	publicKeyPem: string,
	correlationId: string,
): DelegatedContext {
	const parts = token.split('.');
	if (parts.length !== 3) throw new UnauthorizedException();

	try {
		const [encodedHeader, encodedPayload, encodedSignature] = parts;
		const header = JSON.parse(
			Buffer.from(encodedHeader, 'base64url').toString('utf8'),
		) as { alg?: string; typ?: string };
		const claims = JSON.parse(
			Buffer.from(encodedPayload, 'base64url').toString('utf8'),
		) as Record<string, unknown>;
		const publicKey = createPublicKey(publicKeyPem.replaceAll('\\n', '\n'));
		if (
			header.alg !== 'EdDSA' ||
			publicKey.asymmetricKeyType !== 'ed25519' ||
			!verify(
				null,
				Buffer.from(`${encodedHeader}.${encodedPayload}`),
				publicKey,
				Buffer.from(encodedSignature, 'base64url'),
			)
		) {
			throw new UnauthorizedException();
		}

		const now = Math.floor(Date.now() / 1000);
		const issuedAt = claims.iat;
		const expiresAt = claims.exp;
		const audience = claims.aud;
		if (
			claims.iss !== 'bk-nest' ||
			!(audience === 'bk-recommendation-tool' ||
				(Array.isArray(audience) && audience.includes('bk-recommendation-tool'))) ||
			typeof issuedAt !== 'number' ||
			typeof expiresAt !== 'number' ||
			issuedAt > now + 5 ||
			expiresAt <= now ||
			expiresAt - issuedAt > 60 ||
			claims.scope !== 'recommendation:read' ||
			claims.correlation_id !== correlationId ||
			!UUID_PATTERN.test(correlationId) ||
			typeof claims.sub !== 'string' ||
			!UUID_PATTERN.test(claims.sub) ||
			typeof claims.profile_id !== 'string' ||
			!UUID_PATTERN.test(claims.profile_id)
		) {
			throw new UnauthorizedException();
		}
		if (claims.data_classification !== 'synthetic') {
			throw new ForbiddenException({ code: 'SYNTHETIC_DATA_ONLY' });
		}

		return {
			sub: claims.sub,
			profile_id: claims.profile_id,
			scope: 'recommendation:read',
			correlation_id: correlationId,
			data_classification: 'synthetic',
		};
	} catch (error) {
		if (error instanceof ForbiddenException || error instanceof UnauthorizedException) {
			throw error;
		}
		throw new UnauthorizedException();
	}
}

@Injectable()
export class InternalToolGuard implements CanActivate {
	constructor(private readonly config: ConfigService) { }

	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest<InternalToolRequest>();
		const serviceToken = this.config.get<string>('AGENT_GATEWAY_SERVICE_TOKEN');
		const authorization = request.headers.authorization ?? '';
		const [scheme, suppliedToken] = authorization.split(' ');
		const supplied = Buffer.from(suppliedToken ?? '');
		const expected = Buffer.from(serviceToken ?? '');
		if (
			!serviceToken ||
			scheme?.toLowerCase() !== 'bearer' ||
			supplied.length !== expected.length ||
			!timingSafeEqual(supplied, expected)
		) {
			throw new UnauthorizedException();
		}

		const delegatedContext = request.headers['x-delegated-context'];
		const correlationId = request.headers['x-correlation-id'];
		const publicKey = this.config.get<string>('AGENT_DELEGATION_PUBLIC_KEY');
		if (
			typeof delegatedContext !== 'string' ||
			typeof correlationId !== 'string' ||
			!publicKey
		) {
			throw new UnauthorizedException();
		}
		request.delegatedContext = verifyDelegatedAssertion(
			delegatedContext,
			publicKey,
			correlationId,
		);
		return true;
	}
}