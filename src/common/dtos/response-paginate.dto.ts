import { plainToInstance } from 'class-transformer';
import { IsArray } from 'class-validator';
import { PageMetaDto } from './page-meta.dto';

export class ResponsePaginate<T> {
  @IsArray()
  readonly data: T[];

  readonly meta: PageMetaDto;

  readonly message: string;

  constructor(data: any[], meta: PageMetaDto, message: string, dtoClass?: new (...args: any[]) => T) {
    this.data = dtoClass ? plainToInstance(dtoClass, data, { excludeExtraneousValues: true }) : data;
    this.meta = meta;
    this.message = message;
  }
}
