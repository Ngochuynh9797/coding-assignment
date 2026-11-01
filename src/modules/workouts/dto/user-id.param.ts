import { IsUserId } from '@shared/validation/is-user-id';

export class UserIdParam {
  @IsUserId()
  userId!: string;
}
