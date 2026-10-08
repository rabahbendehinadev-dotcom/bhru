import type { PoolClient } from '@workspace/db';
import { safePublicLink } from '../public-site/safety';

/** Reuse current CMS announcements. The existing CMS has no archive/dates. */
export async function customerAnnouncements(subscriber: string, db: PoolClient, home: string) {
  const rows = (await db.query(`SELECT a.id,a.text,a.icon_text,a.destination,a.background_color,a.text_color
    FROM public_site_announcements a
    JOIN public_site_presentation p ON p.subscriber_id=a.subscriber_id
    WHERE a.subscriber_id=$1 AND a.enabled AND p.announcements_enabled
    ORDER BY a.sort_order,a.id`, [subscriber])).rows;
  return rows.map(row => {
    const destination = safePublicLink(row.destination, '');
    return ({
    id: row.id, text: row.text, icon: row.icon_text || '',
    href: destination.startsWith('#') ? home + destination : destination,
    background: row.background_color, color: row.text_color,
  }); });
}
