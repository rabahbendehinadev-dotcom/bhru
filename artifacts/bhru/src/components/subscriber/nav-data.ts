/**
 * Authoritative BHRU Subscriber navigation data (labels, order, groups, columns, routes).
 * Icons are attached in nav-catalog.tsx. Every non-root destination is a flat /m/:slug route.
 */
export type NavColumn = 1 | 2;
export interface NavChildDef { label: string; slug?: string; href?: string; group?: string; column?: NavColumn }
export interface NavEntryDef { id: string; label: string; slug?: string; href?: string; children: NavChildDef[]; badge?: 'online-staff' }

const col = (column: NavColumn, labels: string[], group?: string): NavChildDef[] => labels.map((label) => ({ label, column, group }));
const grp = (group: string, items: (string | NavChildDef)[]): NavChildDef[] =>
  items.map((it) => (typeof it === 'string' ? { label: it, group } : { ...it, group }));

export const NAV_DATA: NavEntryDef[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/', children: [
    { label: 'Dashboard', href: '/', column: 1 },
    ...col(1, ['Verify Payment', 'Credit Summary', 'Pending Collections', 'Close Account Request', 'System Summary', 'New Blog Comments']),
    { label: 'Customer Review', slug: 'customer-reviews', column: 1 },
    ...col(1, ['New Testimonial', 'Login Log', 'Users Waiting For Activation', 'ID (KYC) For Verification']),
    ...col(2, ['Reseller Store', 'Income Summary']),
    { label: 'Find Discounted Users By Service', slug: 'find-discounted-users', column: 2 },
    ...col(2, ['Quick Checkout Pending Orders', 'Quick Checkout Pending Refund', 'User Withdrawal Request', 'IMEI Direct Order', 'IP Search', 'Price Check', 'APi Status']),
  ] },
  { id: 'clients-suppliers', label: 'Clients/Suppliers', children: [
    ...grp('Clients', ['View / Search Clients', '+ Add New Client', '+ Add Bulk Client', 'Client Group', 'Update Multiple Account', 'Block Multiple Account', 'Checkout as Guest']),
    ...grp('Suppliers', ['View / Search Suppliers', '+ Add New Supplier']),
  ] },
  { id: 'products-services', label: 'Products/Services', children: ['IMEI Service', 'File Service', 'Server Service', 'Remote Service', 'Catalog / Cart'].map((label) => ({ label })) },
  { id: 'orders', label: 'Orders', children: ['All Orders', 'IMEI Orders', 'Server Orders', 'Remote Orders', 'Order History'].map((label) => ({ label })) },
  { id: 'retail-orders-cart', label: 'Retail Orders (Cart)', children: [
    ...grp('IMEI / Server Order', ['Accepted IMEI Orders', 'IMEI Orders History']),
    ...grp('File Orders', ['Accepted File Orders', 'File Orders History']),
    ...grp('Server Orders With API', [
      { label: 'Accepted Server Orders', slug: 'api-accepted-server-orders' },
      { label: 'Server Orders History', slug: 'api-server-orders-history' },
    ]),
    ...grp('Server Orders', ['Accepted Server Orders', 'Server Orders History']),
    ...grp('Remote Service', ['Accepted Remote Orders', 'Remote Orders History']),
  ] },
  { id: 'inventory', label: 'Inventory', children: [{ label: 'Digital Inventory' }] },
  { id: 'cms-blog', label: 'CMS / Blog', children: ['Menu Manager', 'Custom Pages', 'Index Banner', 'Page Content', 'Testimonial', 'Gallery', 'Announcements', 'Blog', 'Flash Popup'].map((label): NavChildDef => ({ label })).concat([{ label: 'Public Website', slug: 'cms-blog-public-website' }]) },
  { id: 'reports-graphs', label: 'Reports/Graphs', children: [
    ...col(1, ['Top User by Income', 'Todays 10 Service by Revenue', 'Todays 10 Service by Orders', 'Top 10 Service by Revenue', 'Top 10 Service by Orders',
      'Most Viewable Products', 'Sales by Services', 'Monthly Orders', 'Order Summary ( Retail Shop )', 'Graph', 'Net Profit', 'Profit Graph',
      'Stock Report', 'Promotion Usage', 'User Statement', 'Add Fund Report', 'Fund Transfer Report']),
    ...col(2, ['Credit Report', 'Invoice Summary', 'Invoice Report', 'Service Status', 'Refund Report', 'Suppliers Order', 'Store Product Selling',
      'Staff Summary', 'Auto Reply Report', 'Transaction Report', 'Client Credit/Debit', 'Merchant Orders']),
  ] },
  { id: 'utilities', label: 'Utilities', children: [
    ...col(1, ['Email Campaign', 'Mass Mail', 'Mass SMS', 'Mass GCM', 'Database Status', 'System Cleanup', 'Online User', 'IP Manager',
      'Import Script', 'E-mail Black List', 'Api Log', 'Gateway Log']),
    ...col(2, ['SMS Log', 'Download Log', 'Activity Log', 'Newsletter Subscriber', 'SEO Functions', 'Language Editor', 'Optimise API', 'Survey',
      'Fraud Cage', 'Messenger Notification', 'Blacklist IMEI']),
  ] },
  { id: 'support', label: 'Support', children: grp('Ticket', [
    'Create Ticket', 'Waiting Ticket', 'Open Tickets', 'Customer-reply', 'Answered Ticket',
    { label: 'Closed', slug: 'closed-tickets' }, 'Ticket / Live Help Settings', 'Knowledge Base', 'Download s',
  ]) },
  { id: 'online-user-live-chat', label: 'Online User / Live Chat', children: [] },
  { id: 'settings', label: 'Settings', children: [
    ...col(1, ['General Settings', 'E-Mail Settings', 'Security', 'Automation', 'Currencies', 'Payment Gateways', 'Shipping Gateway', 'SMS Gateway',
      'API Settings', 'System Administrator', 'Product Feature']),
    ...col(2, ['Field Settings', 'Country - Provider', 'Brand - Model', 'MEP', 'Manufacture - Warehouse', 'Provider - Model - MEP', 'PRD',
      'Recharge Voucher', 'Promotion Codes', 'Site Notification']),
  ] },
  { id: 'store', label: 'Store', children: [] },
  { id: 'help', label: 'Help', children: ['Self Update', 'License Information', 'General FAQ', 'Dhru Customer Hub', 'PHP Information'].map((label) => ({ label })) },
  { id: 'online-staff', label: 'Online Staff', children: [], badge: 'online-staff' },
];
