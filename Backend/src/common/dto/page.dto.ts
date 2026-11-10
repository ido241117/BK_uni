import { PageMetaDto } from './page-meta.dto';

export class PageDto<T> {
  constructor(
    readonly data: T[],
    readonly pagination: PageMetaDto,
  ) {}
}
