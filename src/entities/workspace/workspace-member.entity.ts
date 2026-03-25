import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { UserEntity } from '../user/user.entity';
import { WorkspaceEntity } from './workspace.entity';
import { WorkspaceRoleEntity } from './workspace-role.entity';
import { ChannelMemberEntity } from '../channel/channel-member.entity';

@Entity('workspace_members')
export class WorkspaceMemberEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, (workspace) => workspace.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ type: 'uuid' })
  roleId: string;

  @ManyToOne(() => WorkspaceRoleEntity, (role) => role.members)
  @JoinColumn({ name: 'roleId' })
  role: WorkspaceRoleEntity;

  @Column({ type: 'varchar', length: 50, nullable: true })
  displayName?: string;

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status: string;

  @CreateDateColumn()
  joinedAt: Date;

  @OneToMany(() => ChannelMemberEntity, (channelMember) => channelMember.member)
  channelMembers: ChannelMemberEntity[];
}
