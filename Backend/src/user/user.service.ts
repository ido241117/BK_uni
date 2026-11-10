import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { ROLE } from './enum/role';

@Injectable()
export class UserService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  async createStudent(email: string, password: string): Promise<User> {
    try {
      return await this.users.save(this.users.create({ email, password, role: ROLE.STUDENT }));
    } catch (error) {
      if (error instanceof QueryFailedError && (error.driverError as { code?: string }).code === '23505') {
        throw new ConflictException('Email đã được đăng ký.');
      }
      throw error;
    }
  }

  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.users.createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();
  }
}
