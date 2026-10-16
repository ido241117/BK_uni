import {
	MigrationInterface,
	QueryRunner,
	Table,
	TableCheck,
	TableForeignKey,
	TableIndex,
} from 'typeorm';

export class CreateStudentConversations1791091206000 implements MigrationInterface {
	name = 'CreateStudentConversations1791091206000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.createTable(
			new Table({
				name: 'student_conversations',
				columns: [
					{
						name: 'id',
						type: 'uuid',
						isPrimary: true,
						default: 'uuid_generate_v4()',
					},
					{ name: 'profile_id', type: 'uuid', isNullable: false },
					{ name: 'created_at', type: 'timestamptz', default: 'now()', isNullable: false },
					{ name: 'updated_at', type: 'timestamptz', default: 'now()', isNullable: false },
				],
				foreignKeys: [
					new TableForeignKey({
						name: 'fk_student_conversations_profile',
						columnNames: ['profile_id'],
						referencedTableName: 'student_profiles',
						referencedColumnNames: ['id'],
						onDelete: 'CASCADE',
					}),
				],
			}),
		);
		await queryRunner.createIndex(
			'student_conversations',
			new TableIndex({
				name: 'idx_student_conversations_profile_updated',
				columnNames: ['profile_id', 'updated_at'],
			}),
		);
		await queryRunner.createTable(
			new Table({
				name: 'conversation_messages',
				columns: [
					{
						name: 'id',
						type: 'uuid',
						isPrimary: true,
						default: 'uuid_generate_v4()',
					},
					{ name: 'conversation_id', type: 'uuid', isNullable: false },
					{ name: 'turn_id', type: 'uuid', isNullable: false },
					{ name: 'sequence', type: 'integer', isNullable: false },
					{ name: 'role', type: 'text', isNullable: false },
					{ name: 'content', type: 'text', isNullable: true },
					{ name: 'status', type: 'text', isNullable: true },
					{ name: 'recommendation', type: 'jsonb', isNullable: true },
					{ name: 'created_at', type: 'timestamptz', default: 'now()', isNullable: false },
				],
				checks: [
					new TableCheck({
						name: 'chk_conversation_messages_sequence_positive',
						expression: '"sequence" > 0',
					}),
					new TableCheck({
						name: 'chk_conversation_messages_role',
						expression: '"role" IN (\'user\', \'assistant\')',
					}),
					new TableCheck({
						name: 'chk_conversation_messages_state',
						expression: `(
							"role" = 'user' AND "content" IS NOT NULL AND "status" IS NULL AND "recommendation" IS NULL
						) OR (
							"role" = 'assistant' AND "status" IN ('completed', 'clarification', 'out_of_scope') AND "content" IS NOT NULL
						) OR (
							"role" = 'assistant' AND "status" = 'failed' AND "content" IS NULL AND "recommendation" IS NULL
						)`,
					}),
				],
				foreignKeys: [
					new TableForeignKey({
						name: 'fk_conversation_messages_conversation',
						columnNames: ['conversation_id'],
						referencedTableName: 'student_conversations',
						referencedColumnNames: ['id'],
						onDelete: 'CASCADE',
					}),
				],
			}),
		);
		await queryRunner.createIndex(
			'conversation_messages',
			new TableIndex({
				name: 'uq_conversation_messages_sequence',
				columnNames: ['conversation_id', 'sequence'],
				isUnique: true,
			}),
		);
		await queryRunner.createIndex(
			'conversation_messages',
			new TableIndex({
				name: 'uq_conversation_messages_turn_role',
				columnNames: ['conversation_id', 'turn_id', 'role'],
				isUnique: true,
			}),
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.dropTable('conversation_messages');
		await queryRunner.dropTable('student_conversations');
	}
}