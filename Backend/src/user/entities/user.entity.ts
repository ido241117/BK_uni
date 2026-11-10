import { Column, Entity } from 'typeorm';
import { BaseEntityCustom } from '../../common/entities/base-custom.entity';
import { ROLE } from '../enum/role';

@Entity('users')
export class User extends BaseEntityCustom {
  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 60, select: false })
  password!: string;

  @Column({ type: 'enum', enum: ROLE, default: ROLE.STUDENT })
  role!: ROLE;
}
