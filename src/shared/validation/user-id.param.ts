import { IsUserId } from './is-user-id';

export class UserIdParam {
  @IsUserId()
  userId!: string;
}
