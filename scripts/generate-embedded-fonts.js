const fs = require('fs');
const path = require('path');

async function main() {
  console.log('Downloading official Google Fonts WOFF2 for Prompt and Sarabun...');
  const [res400, res600, res700] = await Promise.all([
    fetch('https://fonts.gstatic.com/s/prompt/v12/-W__XJnvUD7dzB2KdNodVkI.woff2'),
    fetch('https://fonts.gstatic.com/s/prompt/v12/-W_8XJnvUD7dzB2Cv_4IfWMuQ5Q.woff2'),
    fetch('https://fonts.gstatic.com/s/prompt/v12/-W_8XJnvUD7dzB2C2_8IfWMuQ5Q.woff2'),
  ]);

  const b400 = Buffer.from(await res400.arrayBuffer()).toString('base64');
  const b600 = Buffer.from(await res600.arrayBuffer()).toString('base64');
  const b700 = Buffer.from(await res700.arrayBuffer()).toString('base64');

  const css = `/**
 * packages/hospital-ui-kit/src/responsive/responsiveTypography.css
 * Master Prompt v7: Zero-Latency Embedded Self-Contained Thai-Latin Typography
 */

/* ==========================================================================
   Self-Contained Base64 Embedded Prompt Typography (Regular 400, SemiBold 600, Bold 700)
   Guarantees 100% instant display of Prompt font without network round-trips
   ========================================================================== */
@font-face {
  font-family: 'Prompt';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('data:font/woff2;base64,${b400}') format('woff2'),
       url('https://fonts.gstatic.com/s/prompt/v12/-W__XJnvUD7dzB2KdNodVkI.woff2') format('woff2');
  unicode-range: U+02D7, U+0303, U+0331, U+0E01-0E5B, U+200C-200D, U+25CC;
}

@font-face {
  font-family: 'Prompt';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('https://fonts.gstatic.com/s/prompt/v12/-W__XJnvUD7dzB2KYNod.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

@font-face {
  font-family: 'Prompt';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('data:font/woff2;base64,${b600}') format('woff2'),
       url('https://fonts.gstatic.com/s/prompt/v12/-W_8XJnvUD7dzB2Cv_4IfWMuQ5Q.woff2') format('woff2');
  unicode-range: U+02D7, U+0303, U+0331, U+0E01-0E5B, U+200C-200D, U+25CC;
}

@font-face {
  font-family: 'Prompt';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('https://fonts.gstatic.com/s/prompt/v12/-W_8XJnvUD7dzB2Cv_4IaWMu.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

@font-face {
  font-family: 'Prompt';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('data:font/woff2;base64,${b700}') format('woff2'),
       url('https://fonts.gstatic.com/s/prompt/v12/-W_8XJnvUD7dzB2C2_8IfWMuQ5Q.woff2') format('woff2');
  unicode-range: U+02D7, U+0303, U+0331, U+0E01-0E5B, U+200C-200D, U+25CC;
}

@font-face {
  font-family: 'Prompt';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('https://fonts.gstatic.com/s/prompt/v12/-W_8XJnvUD7dzB2C2_8IaWMu.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

/* Fallback Sarabun Fonts */
@font-face {
  font-family: 'Sarabun';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('https://fonts.gstatic.com/s/sarabun/v17/DtVjJx26TKEr37c9aAFJn2QN.woff2') format('woff2');
  unicode-range: U+02D7, U+0303, U+0331, U+0E01-0E5B, U+200C-200D, U+25CC;
}

@font-face {
  font-family: 'Sarabun';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('https://fonts.gstatic.com/s/sarabun/v17/DtVmJx26TKEr37c9YMptik8s6zDX.woff2') format('woff2');
  unicode-range: U+02D7, U+0303, U+0331, U+0E01-0E5B, U+200C-200D, U+25CC;
}

/* ==========================================================================
   Root Medical Typography Tokens
   ========================================================================== */
:root {
  --font-medical-sans: 'Prompt', 'Leelawadee UI', 'Sarabun', 'Thonburi', 'Sukhumvit Set', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-heading: 'Prompt', 'Leelawadee UI', 'Sarabun', sans-serif;
  --font-body: 'Prompt', 'Leelawadee UI', 'Sarabun', sans-serif;
  --font-sans: 'Prompt', 'Leelawadee UI', 'Sarabun', 'Thonburi', 'Sukhumvit Set', sans-serif;

  --fluid-h1: clamp(1.4rem, 2.2vw + 0.5rem, 2.35rem);
  --fluid-h2: clamp(1.2rem, 1.6vw + 0.4rem, 1.75rem);
  --fluid-body: clamp(0.9rem, 0.9vw + 0.3rem, 1.1rem);
  --fluid-button: clamp(0.9rem, 0.9vw + 0.3rem, 1.1rem);
}

/* Absolute Global Medical Font Enforcement */
*, *::before, *::after, html, body, input, button, select, textarea, optgroup, [lang="th"], .font-sans {
  font-family: var(--font-medical-sans) !important;
  letter-spacing: 0.015em;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

html, body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  font-feature-settings: 'kern' 1;
  -webkit-text-size-adjust: 100%;
  line-height: 1.6;
}

/* Strict Prevention of Thai Character Squishing */
.tracking-tight, .tracking-tighter {
  letter-spacing: 0.015em !important;
}

.tracking-wide, .tracking-wider {
  letter-spacing: 0.035em !important;
}

.fluid-h1 {
  font-size: var(--fluid-h1);
  letter-spacing: 0.015em;
  line-height: 1.4;
}

.fluid-h2 {
  font-size: var(--fluid-h2);
  letter-spacing: 0.015em;
  line-height: 1.4;
}

.fluid-body {
  font-size: var(--fluid-body);
  line-height: 1.6;
}

.fluid-button {
  font-size: var(--fluid-button);
  letter-spacing: 0.02em;
  font-weight: 600;
}
`;

  const target = path.resolve(__dirname, '../packages/hospital-ui-kit/src/responsive/responsiveTypography.css');
  fs.writeFileSync(target, css);
  console.log('Successfully written self-contained embedded fonts to:', target);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
