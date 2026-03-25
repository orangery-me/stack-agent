import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { WorkspaceEntity } from './workspace.entity';
import { WorkspaceMemberEntity } from './workspace-member.entity';

@Entity('workspace_roles')
export class WorkspaceRoleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, (workspace) => workspace.roles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Column({ type: 'varchar', length: 50 })
  name: string;

  @Column({ type: 'jsonb', nullable: true })
  permissions?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => WorkspaceMemberEntity, (member) => member.role)
  members: WorkspaceMemberEntity[];
}
