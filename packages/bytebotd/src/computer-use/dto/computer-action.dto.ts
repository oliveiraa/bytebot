import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  IsArray,
  Min,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ButtonType,
  CoordinatesDto,
  PressType,
  ScrollDirection,
} from './base.dto';

/**
 * Base class for action DTOs with common validation decorator
 */
abstract class BaseActionDto {
  abstract action: string;
}

export class MoveMouseActionDto extends BaseActionDto {
  @IsIn(['move_mouse'])
  action: 'move_mouse';

  @ValidateNested()
  @Type(() => CoordinatesDto)
  coordinates: CoordinatesDto;
}

export class TraceMouseActionDto extends BaseActionDto {
  @IsIn(['trace_mouse'])
  action: 'trace_mouse';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CoordinatesDto)
  path: CoordinatesDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  holdKeys?: string[];
}

export class ClickMouseActionDto extends BaseActionDto {
  @IsIn(['click_mouse'])
  action: 'click_mouse';

  @IsOptional()
  @ValidateNested()
  @Type(() => CoordinatesDto)
  coordinates?: CoordinatesDto;

  @IsEnum(ButtonType)
  button: ButtonType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  holdKeys?: string[];

  @IsNumber()
  @Min(1)
  clickCount: number;
}

export class PressMouseActionDto extends BaseActionDto {
  @IsIn(['press_mouse'])
  action: 'press_mouse';

  @IsOptional()
  @ValidateNested()
  @Type(() => CoordinatesDto)
  coordinates?: CoordinatesDto;

  @IsEnum(ButtonType)
  button: ButtonType;

  @IsEnum(PressType)
  press: PressType;
}

export class DragMouseActionDto extends BaseActionDto {
  @IsIn(['drag_mouse'])
  action: 'drag_mouse';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CoordinatesDto)
  path: CoordinatesDto[];

  @IsEnum(ButtonType)
  button: ButtonType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  holdKeys?: string[];
}

export class ScrollActionDto extends BaseActionDto {
  @IsIn(['scroll'])
  action: 'scroll';

  @IsOptional()
  @ValidateNested()
  @Type(() => CoordinatesDto)
  coordinates?: CoordinatesDto;

  @IsEnum(ScrollDirection)
  direction: ScrollDirection;

  @IsNumber()
  @Min(1)
  scrollCount: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  holdKeys?: string[];
}

export class TypeKeysActionDto extends BaseActionDto {
  @IsIn(['type_keys'])
  action: 'type_keys';

  @IsArray()
  @IsString({ each: true })
  keys: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  delay?: number;
}

export class PressKeysActionDto extends BaseActionDto {
  @IsIn(['press_keys'])
  action: 'press_keys';

  @IsArray()
  @IsString({ each: true })
  keys: string[];

  @IsEnum(PressType)
  press: PressType;
}

export class TypeTextActionDto extends BaseActionDto {
  @IsIn(['type_text'])
  action: 'type_text';

  @IsString()
  text: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  delay?: number;
}

export class WaitActionDto extends BaseActionDto {
  @IsIn(['wait'])
  action: 'wait';

  @IsNumber()
  @Min(0)
  duration: number;
}

export class ScreenshotActionDto extends BaseActionDto {
  @IsIn(['screenshot'])
  action: 'screenshot';
}

export class CursorPositionActionDto extends BaseActionDto {
  @IsIn(['cursor_position'])
  action: 'cursor_position';
}

// Union type for all computer actions
export type ComputerActionDto =
  | MoveMouseActionDto
  | TraceMouseActionDto
  | ClickMouseActionDto
  | PressMouseActionDto
  | DragMouseActionDto
  | ScrollActionDto
  | TypeKeysActionDto
  | PressKeysActionDto
  | TypeTextActionDto
  | WaitActionDto
  | ScreenshotActionDto
  | CursorPositionActionDto;
