# Homepage Content And Visual Update

## Scope

- Replaced repeated raster marketing headings with image-only illustrations.
- Combined each value illustration, heading and description into one card; removed the large duplicate value infographic.
- The accountant section is the final content section, after the proposal form and directly above the footer. The user supplied the profile, career summary, business contact details, office address and portrait; these are reflected on the homepage.
- Unified section labels and FAQ borders, spacing and typography. Blue remains the action color; mint remains a check/completion color.
- Compressed information protection into a 140px desktop band: one heading, one summary line and a small CSS-cropped view of the original shield. The image file is unchanged; mobile text wraps without clipping.
- Made the 2026 expected audit budget optional. Kept `auditFee`, its unit, existing Apps Script URL, spreadsheet columns and notification behavior unchanged.
- Left the internal-control page and its API/receiver unchanged.

## User-Supplied Profile Material

The profile uses the user's supplied statements: current director at Hangil Accounting Corporation, formerly Samil Accounting Corporation, external audit/financial analysis, internal-control support, AI accounting/audit automation development and consulting, and practical AI training. No employment dates, named clients, engagement counts or performance statistics were added. The supplied PNG portrait is copied unchanged to `images/accountant-profile.png`; it is not AI-retouched. Phone and email appear in the profile and next to the proposal form; the detailed office address appears only in the footer. Public contact information is separate from the unchanged application notification mailbox and receiver settings.

## Illustration Provenance

Built-in image generation edited the existing five source illustrations; originals are preserved. Each prompt removed large marketing headings while preserving relevant functional diagrams and small status labels. The value image was recomposed into three equal-width illustrations for separate cards. The other edits retain the conversion workflow, analysis dashboard, PBC status panels and information-protection diagram. New assets are WebP files in `images/` with descriptive filenames. No generated person/photo, customer case or new performance claim was added.

The final prompt set requested: (1) equal-width calculator, submission-dashboard and AI-analysis compositions with no promotional captions; (2) three service workflow panels without their large section heading; (3) the spreadsheet conversion comparison without its headline/subtitle; (4) the two PBC panels without the left promotional block; (5) the protection diagram without the left headline or decorative wave. All edits used the built-in image tool and retained functional labels.

## Verification

```sh
node --test tests/proposal-form.test.js tests/internal-control-inquiry.test.js tests/internal-control-inquiry-ui.test.js
python tests/seo_check.py
```

The homepage form tests use a mock network and Apps Script services. They check an omitted fee, the existing fee unit and column layout, required fields and malformed email. They do not send a real inquiry or prove mail delivery. The pre-existing external-audit form still uses a `no-cors` request, so it cannot independently confirm persistence; changing that reception architecture is outside this visual update. Do not report these tests as a live Sheets/mail receipt test.
