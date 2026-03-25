import { plainToInstance } from 'class-transformer';

export class ResponseItem<T> {
  readonly data: T | T[];

  readonly message: string;

  constructor(data: T | T[], message = 'Thành công', dtoClass?: new () => T) {
    if (dtoClass) {
      this.data = Array.isArray(data)
        ? plainToInstance(dtoClass, data, { excludeExtraneousValues: true })
        : plainToInstance(dtoClass, data as T, { excludeExtraneousValues: true });
    } else {
      this.data = data;
    }

    this.message = message;
  }
}
