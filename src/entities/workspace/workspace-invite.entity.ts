import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { WorkspaceEntity } from './workspace.entity';
import { WorkspaceMemberEntity } from './workspace-member.entity';
import { WorkspaceRoleEntity } from './workspace-role.entity';

@Entity('workspace_invites')
export class WorkspaceInviteEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'uuid' })
  roleId: string;

  @ManyToOne(() => WorkspaceRoleEntity)
  @JoinColumn({ name: 'roleId' })
  role: WorkspaceRoleEntity;

  @Column({ type: 'uuid' })
  invitedBy: string;

  @ManyToOne(() => WorkspaceMemberEntity)
  @JoinColumn({ name: 'invitedBy' })
  inviter: WorkspaceMemberEntity;

  @Column({ type: 'varchar', length: 255, unique: true })
  token: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  acceptedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;
}
