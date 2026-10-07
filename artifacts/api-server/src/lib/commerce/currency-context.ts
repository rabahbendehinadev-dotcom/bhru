import type { Request } from 'express';
import { z } from '@workspace/api-zod';
import { authorizeTenant, HttpError, requireAdmin, requireUser } from '../auth';

/** Read-only target from the existing administrator workspace preview selection.
 * A header never grants privileges: the selected realm must have a live admin session.
 * Currency writes retain their separate subscriber-only guard.
 */
export function currencyReadContext(req: Request) {
  const user = requireUser(req);
  const previewId = req.get('X-BHRU-Preview-Subscriber');
  if (!user.admin) {
    if (previewId) throw new HttpError(403, 'Administrator preview access required.');
    authorizeTenant(req, user.subscriber_id);
    return { subscriber_id: user.subscriber_id, user_id: user.id };
  }
  const admin = requireAdmin(req);
  if (admin.id !== user.id || !previewId) {
    throw new HttpError(403, 'Select a subscriber through administrator preview.');
  }
  const id = z.string().uuid().parse(previewId);
  authorizeTenant(req, id);
  return { subscriber_id: id, user_id: undefined };
}
