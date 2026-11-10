import { PartialType } from '@nestjs/swagger';
import { CreateRegulationDto } from './create-regulation.dto';

export class UpdateRegulationDto extends PartialType(CreateRegulationDto) {}
