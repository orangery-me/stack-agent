import 'dotenv/config';
import { seeder } from 'nestjs-seeder';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserEntity } from '@app/entities';
import { DatabaseModule } from './config/database.module';
import { UserSeeder } from './seeders/user.seeder';

seeder({
  imports: [DatabaseModule, TypeOrmModule.forFeature([UserEntity])],
}).run([UserSeeder]);
