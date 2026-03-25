import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ChannelEntity } from './channel.entity';
import { WorkspaceMemberEntity } from '../workspace/workspace-member.entity';

@Entity('channel_members')
export class ChannelMemberEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  channelId: string;

  @ManyToOne(() => ChannelEntity, (channel) => channel.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'channelId' })
  channel: ChannelEntity;

  @Column({ type: 'uuid' })
  memberId: string;

  @ManyToOne(() => WorkspaceMemberEntity, (member) => member.channelMembers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'memberId' })
  member: WorkspaceMemberEntity;

  @Column({ type: 'varchar', length: 20, default: 'human' })
  memberType: string; // human | bot

  @Column({ type: 'varchar', length: 20, default: 'member' })
  memberRole: string; // manager | member

  @CreateDateColumn()
  joinedAt: Date;
}
