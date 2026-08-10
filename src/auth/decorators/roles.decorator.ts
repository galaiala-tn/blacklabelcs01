import { SetMetadata } from '@nestjs/common';
import { AppRole } from '../../common/enums';

export const ROLES_KEY = 'roles';

/** Restricts a route to one or more roles, e.g. @Roles(AppRole.ADMIN) */
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
