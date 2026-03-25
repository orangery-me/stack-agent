import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { WorkspaceEntity } from '../workspace/workspace.entity';
import { WorkspaceMemberEntity } from '../workspace/workspace-member.entity';
import { ChannelMemberEntity } from './channel-member.entity';
import { ChannelRoleEntity } from './channel-role.entity';

@Entity('channels')
export class ChannelEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, (workspace) => workspace.channels, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Column({ type: 'varchar', length: 20 })
  type: string; // public | private | dm | group_dm

  @Column({ type: 'varchar', length: 255, nullable: true })
  name?: string | null; // null for DM if needed

  @Column({ type: 'uuid' })
  createdById: string;

  @ManyToOne(() => WorkspaceMemberEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'createdById' })
  createdBy: WorkspaceMemberEntity;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  settings?: Record<string, any>;

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => ChannelMemberEntity, (member) => member.channel)
  members: ChannelMemberEntity[];

  @OneToMany(() => ChannelRoleEntity, (role) => role.channel)
  roles: ChannelRoleEntity[];
}
