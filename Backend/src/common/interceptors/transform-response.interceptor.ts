import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { buildSuccess } from '../dto/api-response.dto';
import { PageDto } from '../dto/page.dto';

@Injectable()
export class TransformResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data: unknown) => {
      if (data instanceof PageDto) {
        return { ...buildSuccess(data.data), pagination: data.pagination };
      }
      return buildSuccess(data);
    }));
  }
}
