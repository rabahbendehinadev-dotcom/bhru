import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(new URL('../package.json', import.meta.url));
const { build } = createRequire(require.resolve('vite'))('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const result = await build({
  entryPoints: [fileURLToPath(new URL('../src/pages/general-settings.tsx', import.meta.url))],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  external: ['react', 'react/jsx-runtime', 'lucide-react'],
  // This test measures markup, not authentication or the network. Integration
  // and browser tests exercise the real persistence hook separately.
  plugins: [{
    name: 'settings-layout-only',
    setup(builder) {
      builder.onResolve({ filter: /hooks\/use-general-settings$/ }, () => ({ path: 'settings-hook', namespace: 'layout-test' }));
      builder.onLoad({ filter: /.*/, namespace: 'layout-test' }, () => ({
        contents: `export const useGeneralSettings = () => ({
          v: () => '', set: () => () => {}, tog: () => ({checked:false,onChange:()=>{}}),
          errors:{}, notice:null, loading:false, saving:false, ready:true, dirty:false,
          canRetry:true, save:async()=>{}, reload:async()=>{}
        });`,
        loader: 'js',
      }));
    },
  }],
});
const mod = { exports: {} };
vm.runInNewContext(result.outputFiles[0].text, { module: mod, exports: mod.exports, require, console });
const markup = renderToStaticMarkup(React.createElement(mod.exports.default));

const sections = [
  'Site Information', 'Site Links', 'SEO Settings', 'Site Settings', 'Site Page Redirect', 'Fund Settings',
];
const nav = [
  'General Settings', 'Registration / Profile', 'Shopping Cart', 'Localizations', 'Tax', 'Invoice',
  'Contact Us', 'Orders', 'Fraud protection', 'Appearance', 'Other',
];
const toggles = [
  'Faster Browsing', 'Recharge Voucher', 'Testimonial', 'Blog', 'Knowledge Base', 'Support Ticket',
  'Show Service Price', 'Show Service Icon', 'Affiliate System', 'Gift Certificate',
  'Gift Certificate Tax', 'Withdrawal Request', 'EU Cookie Law', 'E-mail History Save',
  'User can Manage Credit Card Detail', 'Mobile App', 'Display Track Order', 'Display Downloads',
];
const labels = [
  'Company Name', 'Site Name', 'Logo Link', 'Favicon Icon', 'Site Link', 'Site SSL Link',
  'SEO Friendly url', 'Page Title Format', 'Site Description', 'Site Keywords', ...toggles,
  'Index Redirect', 'Logout Redirect', 'Add Fund', 'Tax for add fund',
  'Minimum Add Fund', 'Maximum Add Fund', 'Maximum Balance',
];

const actualSections = [...markup.matchAll(/<h2 id="gs-h-[^"]+">([^<]+)/g)].map((m) => m[1]);
assert.deepEqual(actualSections, sections, 'Six settings sections must remain in reference order');
const actualNav = [...markup.matchAll(/class="gs-nav-item"[^>]*>([^<]+)<\/button>/g)].map((m) => m[1]);
assert.deepEqual(actualNav, nav, 'Secondary navigation must retain all exact labels and order');
assert.equal((markup.match(/aria-current="page"/g) ?? []).length, 1, 'Only General Settings is active');
assert.equal((markup.match(/aria-disabled="true"/g) ?? []).length, 10, 'Unbuilt pages are not clickable');
const actualLabels = [...markup.matchAll(/class="gs-label"[^>]*>([^<]+)<\/label>/g)].map((m) => m[1]);
assert.deepEqual(actualLabels, labels, 'No reference field or toggle may be omitted or renamed');
const siteSettings = markup.slice(markup.indexOf('data-testid="section-site-settings"'), markup.indexOf('</section>', markup.indexOf('data-testid="section-site-settings"')));
assert.equal((siteSettings.match(/role="switch"/g) ?? []).length, 18);
assert.equal((markup.match(/type="number"/g) ?? []).length, 3, 'All three fund limits are numeric inputs');
assert.equal((markup.match(/>Add From Gallery<\/button>/g) ?? []).length, 2);
for (const text of [
  'Your Company Name as you want it to appear throughout the system',
  'Enter your logo URL to display in email messages or leave blank for none',
  '64 Kb PNG image recommended', 'Header META tag description', 'Reseller Price Page icon',
  'Main index page redirect to eg. main.php', 'Redirection after logout eg. main.php',
  'Adding of funds by clients from the client area', 'Enable tax for Add Fund',
  'Set Minimum Fund Limit Payment Gateway wise', 'Set Maximum Fund Limit Payment Gateway wise',
  'Enter the minimum amount a client can add in a single transaction',
  'Enter the maximum amount a client can add in a single transaction',
  'Enter the maximum balance that a client can add in credit',
  'No unsaved changes.',
]) assert.ok(markup.includes(text), `Missing reference helper or save disclosure: ${text}`);
console.log('PASS: General Settings retains reference sections, 11 navigation labels, 18 site toggles, 3 numeric inputs, labels and helpers after persistence integration.');
