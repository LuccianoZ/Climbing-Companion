import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

// A minimal, narrowly-scoped module: BL-x09 needs a server-side write path
// for `badges_public` (it gates a server-side visibility rule, so it can't
// be client-only state the way AR-20 left BL-046's display toggle). This is
// not the Settings epic (BL-046-049) -- no grade-display or photo-gallery
// endpoints live here, only what BL-x09 actually needs.
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  async setBadgesPublic(userId: string, badgesPublic: boolean): Promise<User> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User "${userId}" not found`);
    }
    user.badgesPublic = badgesPublic;
    return this.users.save(user);
  }
}
