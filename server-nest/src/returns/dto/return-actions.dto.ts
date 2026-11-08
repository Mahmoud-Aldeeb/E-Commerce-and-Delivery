import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ApproveReturnDto {
  @ApiPropertyOptional({
    description: 'Shown to the customer, for example how to send the items',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'The note must be 300 characters or fewer' })
  note?: string;
}

export class RejectReturnDto {
  @ApiProperty({
    description: 'Why the return is refused: the customer reads it',
  })
  @IsString({ message: 'Say why the return is refused' })
  @IsNotEmpty({ message: 'Say why the return is refused' })
  @MaxLength(300, { message: 'The note must be 300 characters or fewer' })
  note: string;
}

export class CompleteReturnDto {
  @ApiProperty({
    description: 'true = the items go back on the shelves (their stock grows)',
  })
  @IsBoolean({ message: 'restock must be true or false' })
  restock: boolean;

  @ApiPropertyOptional({
    description:
      'A cash order only: true = the money was given back by hand (InstaPay, a wallet...)',
  })
  @IsOptional()
  @IsBoolean({ message: 'cashRefunded must be true or false' })
  cashRefunded?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'The note must be 300 characters or fewer' })
  note?: string;
}
