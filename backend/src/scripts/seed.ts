import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import dataSource from '../data-source';
import { User } from '../users/user.entity';

async function seed() {
	const environment = process.env.NODE_ENV || 'development';
	if (!['development', 'test'].includes(environment)) {
		throw new Error(
			'Seed is allowed only in development or test environments.',
		);
	}

	const email = process.env.ADMIN_SEED_EMAIL?.trim().toLowerCase();
	const password = process.env.ADMIN_SEED_PASSWORD;
	if (!email || !password || password.length < 8) {
		throw new Error(
			'Set ADMIN_SEED_EMAIL and an ADMIN_SEED_PASSWORD of at least 8 characters.',
		);
	}

	const passwordHash = await bcrypt.hash(password, 12);
	await dataSource.initialize();
	try {
		await dataSource.transaction(async (manager) => {
			const users = manager.getRepository(User);
			const admin = await users
				.createQueryBuilder('user')
				.where('lower(user.email) = :email', { email })
				.getOne();

			if (admin) {
				admin.email = email;
				admin.passwordHash = passwordHash;
				admin.role = 'admin';
				await users.save(admin);
				return;
			}

			await users.save(users.create({ email, passwordHash, role: 'admin' }));
		});
		console.log(`Admin seed is ready for ${email}.`);
	} finally {
		await dataSource.destroy();
	}
}

seed().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : 'Seed failed.');
	process.exitCode = 1;
});
