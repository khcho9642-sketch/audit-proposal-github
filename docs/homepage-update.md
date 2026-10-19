# Homepage Content And Visual Update

## Scope

- Replaced repeated raster marketing headings with image-only illustrations.
- Combined each value illustration, heading and description into one card; removed the large duplicate value infographic.
- Moved the accountant section immediately after the hero, with confirmed name and existing service scope only.
- Unified section labels and FAQ borders, spacing and typography. Blue remains the action color; mint remains a check/completion color.
- Made the 2026 expected audit budget optional. Kept `auditFee`, its unit, existing Apps Script URL, spreadsheet columns and notification behavior unchanged.
- Left the internal-control page and its API/receiver unchanged.

## Profile Material Still Needed

The repository has no verified portrait, current firm/title, dated work history, client/audit experience, public business phone or office address. Do not publish invented facts or placeholders. Obtain the accountant's approved photo and profile, plus confirmed public business contact details, before adding them to the profile, inquiry area or footer. The notification mailbox is not automatically a public business contact.

## Illustration Provenance

Built-in image generation edited the existing five source illustrations; originals are preserved. Each prompt removed large marketing headings while preserving relevant functional diagrams and small status labels. The value image was recomposed into three equal-width illustrations for separate cards. The other edits retain the conversion workflow, analysis dashboard, PBC status panels and information-protection diagram. New assets are WebP files in `images/` with descriptive filenames. No generated person/photo, customer case or new performance claim was added.

The final prompt set requested: (1) equal-width calculator, submission-dashboard and AI-analysis compositions with no promotional captions; (2) three service workflow panels without their large section heading; (3) the spreadsheet conversion comparison without its headline/subtitle; (4) the two PBC panels without the left promotional block; (5) the protection diagram without the left headline or decorative wave. All edits used the built-in image tool and retained functional labels.

## Verification

```sh
node --test tests/proposal-form.test.js tests/internal-control-inquiry.test.js tests/internal-control-inquiry-ui.test.js
python tests/seo_check.py
```

The homepage form tests use a mock network and Apps Script services. They check an omitted fee, the existing fee unit and column layout, required fields and malformed email. They do not send a real inquiry or prove mail delivery. The pre-existing external-audit form still uses a `no-cors` request, so it cannot independently confirm persistence; changing that reception architecture is outside this visual update. Do not report these tests as a live Sheets/mail receipt test.
