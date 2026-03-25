import { Exclude, Transform } from 'class-transformer';
import { Column } from 'typeorm';

export abstract class AbstractEntity {
  @Transform(({ value }) => value?.toString())
  id: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  @Exclude()
  createdAt: Date;

  @Column({ type: 'varchar', nullable: true })
  @Exclude()
  createdBy?: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  @Exclude()
  updatedAt: Date;

  @Column({ type: 'varchar', nullable: true })
  @Exclude()
  updatedBy?: string;

  @Column({ type: 'timestamp', nullable: true })
  @Exclude()
  deletedAt?: Date;

  @Column({ type: 'varchar', nullable: true })
  @Exclude()
  deletedBy?: string;
}
