import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class ListExercisesQuery {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  // A blank term normalizes to '' and would match the whole catalog.
  @Matches(/\S/, { message: 'search must not be blank' })
  search?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z_]{1,50}$/, { message: 'muscleGroup must match ^[a-z_]{1,50}$' })
  muscleGroup?: string;
}
