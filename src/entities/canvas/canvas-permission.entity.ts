import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { CanvasEntity } from './canvas.entity';

@Entity('canvas_permissions')
@Index(['canvasId', 'type', 'targetId'], { unique: true })
export class CanvasPermissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  canvasId: string;

  @ManyToOne(() => CanvasEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'canvasId' })
  canvas: CanvasEntity;

  @Column({ type: 'varchar', length: 16 })
  type: 'user' | 'channel';

  @Column({ type: 'uuid' })
  targetId: string;

  @Column({ type: 'varchar', length: 16 })
  role: 'viewer' | 'editor';

  @CreateDateColumn()
  createdAt: Date;
}

