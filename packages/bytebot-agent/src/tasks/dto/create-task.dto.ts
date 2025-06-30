import { IsDate, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Role, TaskPriority, TaskType } from '@prisma/client';

export class CreateTaskDto {
  @IsNotEmpty()
  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  type?: TaskType;

  @IsOptional()
  @IsDate()
  scheduledFor?: Date;

  @IsOptional()
  @IsString()
  priority?: TaskPriority;

  @IsOptional()
  @IsString()
  createdBy?: Role;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  model?: 'CLAUDE_SONNET_4' | 'CLAUDE_OPUS_4';
}
