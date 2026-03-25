import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ChannelEntity } from './channel.entity';

@Entity('channel_roles')
export class ChannelRoleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  channelId?: string | null;

  @ManyToOne(() => ChannelEntity, (channel) => channel.roles, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'channelId' })
  channel?: ChannelEntity | null;

  @Column({ type: 'varchar', length: 50 })
  name: string; // manager | member

  @Column({ type: 'jsonb', nullable: true })
  permissions?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}
