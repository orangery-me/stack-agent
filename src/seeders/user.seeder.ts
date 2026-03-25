import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Seeder } from 'nestjs-seeder';
// import * as bcrypt from 'bcrypt';
import * as bcrypt from 'bcryptjs';

import { UserEntity } from '@app/entities';
import { UserStatusEnum, UserRoleEnum } from '@Constant/enums';
import { Repository } from 'typeorm';

@Injectable()
export class UserSeeder implements Seeder {
  constructor(@InjectRepository(UserEntity) private readonly userRepository: Repository<UserEntity>) {}

  async seed(): Promise<any> {
    // Check if users already exist
    const existingUsers = await this.userRepository.count();
    if (existingUsers > 0) {
      console.log('🌱 Users already exist, skipping seed...');
      return;
    }

    // Admin user
    const adminUser = {
      email: 'admin@todovillage.com',
      phone: '0123456789',
      password: await bcrypt.hash('admin123456', 10),
      name: 'Admin Stack App',
      status: UserStatusEnum.ACTIVE,
      role: UserRoleEnum.ADMIN,
      emailVerified: true,
      provider: 'local',
      avatar: null,
      dateOfBirth: new Date('1990-01-01'),
      address: 'Hà Nội, Việt Nam',
    };

    // Moderator user
    const moderatorUser = {
      email: 'moderator@todovillage.com',
      phone: '0987654321',
      password: await bcrypt.hash('mod123456', 10),
      name: 'Moderator Stack App',
      status: UserStatusEnum.ACTIVE,
      role: UserRoleEnum.MODERATOR,
      emailVerified: true,
      provider: 'local',
      avatar: null,
      dateOfBirth: new Date('1992-05-15'),
      address: 'Hồ Chí Minh, Việt Nam',
    };

    // Sample regular users
    const regularUsers = [
      {
        email: 'user1@todovillage.com',
        phone: '0111111111',
        password: await bcrypt.hash('user123456', 10),
        name: 'Nguyễn Văn An',
        status: UserStatusEnum.ACTIVE,
        role: UserRoleEnum.USER,
        emailVerified: true,
        provider: 'local',
        avatar: null,
        dateOfBirth: new Date('1995-03-20'),
        address: 'Đà Nẵng, Việt Nam',
      },
      {
        email: 'user2@todovillage.com',
        phone: '0222222222',
        password: await bcrypt.hash('user123456', 10),
        name: 'Trần Thị Bình',
        status: UserStatusEnum.ACTIVE,
        role: UserRoleEnum.USER,
        emailVerified: true,
        provider: 'local',
        avatar: null,
        dateOfBirth: new Date('1993-07-10'),
        address: 'Cần Thơ, Việt Nam',
      },
      {
        email: 'user3@todovillage.com',
        phone: '0333333333',
        password: await bcrypt.hash('user123456', 10),
        name: 'Lê Văn Cường',
        status: UserStatusEnum.INACTIVE,
        role: UserRoleEnum.USER,
        emailVerified: false,
        provider: 'local',
        avatar: null,
        dateOfBirth: new Date('1996-12-05'),
        address: 'Hải Phòng, Việt Nam',
      },
      {
        email: 'blocked@todovillage.com',
        phone: '0444444444',
        password: await bcrypt.hash('user123456', 10),
        name: 'Phạm Thị Dương',
        status: UserStatusEnum.BLOCKED,
        role: UserRoleEnum.USER,
        emailVerified: true,
        provider: 'local',
        avatar: null,
        dateOfBirth: new Date('1994-09-18'),
        address: 'Quảng Ninh, Việt Nam',
      },
      {
        email: 'pending@todovillage.com',
        phone: '0555555555',
        password: await bcrypt.hash('user123456', 10),
        name: 'Hoàng Văn Em',
        status: UserStatusEnum.PENDING_VERIFICATION,
        role: UserRoleEnum.USER,
        emailVerified: false,
        provider: 'local',
        avatar: null,
        dateOfBirth: new Date('1997-02-28'),
        address: 'Bình Dương, Việt Nam',
        emailVerificationToken: 'sample-verification-token-123',
        emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
      },
    ];

    // Google OAuth user example
    const googleUser = {
      email: 'google@todovillage.com',
      phone: '0666666666',
      password: null, // Google users don't have password
      name: 'Google User Example',
      status: UserStatusEnum.ACTIVE,
      role: UserRoleEnum.USER,
      emailVerified: true,
      provider: 'google',
      googleId: 'google-id-123456789',
      avatar: 'https://lh3.googleusercontent.com/a/default-user',
      dateOfBirth: new Date('1991-11-11'),
      address: 'Online',
    };

    const allUsers = [adminUser, moderatorUser, ...regularUsers, googleUser];

    // Insert all users
    const insertedUsers = await this.userRepository.insert(allUsers);

    console.log('🌱 Successfully seeded users:');
    console.log(`   📧 Admin: ${adminUser.email} / admin123456`);
    console.log(`   🛡️  Moderator: ${moderatorUser.email} / mod123456`);
    console.log(`   👤 Regular Users: ${regularUsers.length} users / user123456`);
    console.log(`   🔗 Google User: ${googleUser.email}`);
    console.log(`   📊 Total: ${insertedUsers.raw.length} users created`);

    return insertedUsers;
  }

  async drop(): Promise<any> {
    const deletedCount = await this.userRepository.delete({});
    console.log(`🗑️  Dropped ${deletedCount.raw.length} users`);
    return deletedCount;
  }
}
