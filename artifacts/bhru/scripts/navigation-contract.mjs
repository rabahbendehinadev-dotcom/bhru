// Independent acceptance contract from the approved subscriber structure brief.
// This is test data, not a second application navigation definition.
export const contract = [
  { label: 'Dashboard', columns: [
    ['Dashboard', 'Verify Payment', 'Credit Summary', 'Pending Collections', 'Close Account Request', 'System Summary', 'New Blog Comments', 'Customer Review', 'New Testimonial', 'Login Log', 'Users Waiting For Activation', 'ID (KYC) For Verification'],
    ['Reseller Store', 'Income Summary', 'Find Discounted Users By Service', 'Quick Checkout Pending Orders', 'Quick Checkout Pending Refund', 'User Withdrawal Request', 'IMEI Direct Order', 'IP Search', 'Price Check', 'APi Status'],
  ] },
  { label: 'Clients/Suppliers', groups: {
    Clients: ['View / Search Clients', '+ Add New Client', '+ Add Bulk Client', 'Client Group', 'Update Multiple Account', 'Block Multiple Account', 'Checkout as Guest'],
    Suppliers: ['View / Search Suppliers', '+ Add New Supplier'],
  } },
  { label: 'Products/Services', items: ['IMEI Service', 'File Service', 'Server Service', 'Remote Service', 'Catalog / Cart'] },
  { label: 'Orders', items: ['All Orders', 'IMEI Orders', 'Server Orders', 'Remote Orders', 'Order History'] },
  { label: 'Retail Orders (Cart)', groups: {
    'IMEI / Server Order': ['Accepted IMEI Orders', 'IMEI Orders History'],
    'File Orders': ['Accepted File Orders', 'File Orders History'],
    'Server Orders With API': ['Accepted Server Orders', 'Server Orders History'],
    'Server Orders': ['Accepted Server Orders', 'Server Orders History'],
    'Remote Service': ['Accepted Remote Orders', 'Remote Orders History'],
  } },
  { label: 'Inventory', items: ['Digital Inventory'] },
  { label: 'CMS / Blog', items: ['Menu Manager', 'Custom Pages', 'Index Banner', 'Page Content', 'Testimonial', 'Gallery', 'Announcements', 'Blog', 'Flash Popup'] },
  { label: 'Reports/Graphs', columns: [
    ['Top User by Income', 'Todays 10 Service by Revenue', 'Todays 10 Service by Orders', 'Top 10 Service by Revenue', 'Top 10 Service by Orders', 'Most Viewable Products', 'Sales by Services', 'Monthly Orders', 'Order Summary ( Retail Shop )', 'Graph', 'Net Profit', 'Profit Graph', 'Stock Report', 'Promotion Usage', 'User Statement', 'Add Fund Report', 'Fund Transfer Report'],
    ['Credit Report', 'Invoice Summary', 'Invoice Report', 'Service Status', 'Refund Report', 'Suppliers Order', 'Store Product Selling', 'Staff Summary', 'Auto Reply Report', 'Transaction Report', 'Client Credit/Debit', 'Merchant Orders'],
  ] },
  { label: 'Utilities', columns: [
    ['Email Campaign', 'Mass Mail', 'Mass SMS', 'Mass GCM', 'Database Status', 'System Cleanup', 'Online User', 'IP Manager', 'Import Script', 'E-mail Black List', 'Api Log', 'Gateway Log'],
    ['SMS Log', 'Download Log', 'Activity Log', 'Newsletter Subscriber', 'SEO Functions', 'Language Editor', 'Optimise API', 'Survey', 'Fraud Cage', 'Messenger Notification', 'Blacklist IMEI'],
  ] },
  { label: 'Support', groups: {
    Ticket: ['Create Ticket', 'Waiting Ticket', 'Open Tickets', 'Customer-reply', 'Answered Ticket', 'Closed', 'Ticket / Live Help Settings', 'Knowledge Base', 'Download s'],
  } },
  { label: 'Online User / Live Chat', items: [] },
  { label: 'Settings', columns: [
    ['General Settings', 'E-Mail Settings', 'Security', 'Automation', 'Currencies', 'Payment Gateways', 'Shipping Gateway', 'SMS Gateway', 'API Settings', 'System Administrator', 'Product Feature'],
    ['Field Settings', 'Country - Provider', 'Brand - Model', 'MEP', 'Manufacture - Warehouse', 'Provider - Model - MEP', 'PRD', 'Recharge Voucher', 'Promotion Codes', 'Site Notification'],
  ] },
  { label: 'Store', items: [] },
  { label: 'Help', items: ['Self Update', 'License Information', 'General FAQ', 'Dhru Customer Hub', 'PHP Information'] },
  { label: 'Online Staff', items: [] },
];
