import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, UpdateDateColumn, Index } from 'typeorm';
import { CanvasEntity } from './canvas.entity';
import { UserEntity } from '../user/user.entity';

@Entity('canvas_recents')
@Index(['userId', 'canvasId'], { unique: true })
export class CanvasRecentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ type: 'uuid' })
  canvasId: string;

  @ManyToOne(() => CanvasEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'canvasId' })
  canvas: CanvasEntity;

  @UpdateDateColumn()
  lastOpenedAt: Date;
}
