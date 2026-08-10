# Gold Set Data Population Changelog

This changelog documents the complete population of `eval/gold_set.json` using real document data from the KnowledgeIQ MongoDB `documents` collection and Pinecone vector store.

---

## 1. Gold Set Entries Mapping Table

All placeholder entries (`PLACEHOLDER_REPLACE_ME`) in `eval/gold_set.json` have been replaced with real document IDs, queries grounded in extracted text, and verbatim source excerpts.

| Entry ID | Target Document Filename | Category | Real `expected_documentId` | Test Type | Verbatim `expected_answer_contains` Excerpt |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `eval_01` | `Akshay Surana Job Resume.pdf` | `hr` | `c5711327-4358-4ef6-9fdc-b101d359fb01` | `standard` | `"dynamic us tax senior professional with 56 years of expertise"` |
| `eval_02` | `For KnowledgeIQ - Company-Policy-and-Procedure-June-1.18-V6.0.pdf` | `hr` | `b305c43e-2527-4a73-830e-38d250253b2a` | `standard` | `"approved by charu g raheja phd chairceo triagelogic"` |
| `eval_03` | `Trust_Code_2022_en-us_2023_0509.pdf` | `hr` | `cced4291-6a37-4aed-8087-4e6cb85caa69` | `standard` | `"email the business conduct and compliance alias buscondmicrosoftcom for advice"` |
| `eval_04` | `supplier-code-of-conduct-help-tool.pdf` | `compliance` | `962b67e9-e2f7-4a7a-8ca3-c365e278191f` | `standard` | `"Accurate and transparent documentation of all services is important"` |
| `eval_05` | `Responsible-AI-Transparency-Report-2025.pdf` | `it` | `34bf4db0-95fb-4bbb-bb1b-70fdbbb5e109` | `standard` | `"we invest in open standards like c2pa"` |
| `eval_06` | `2026-Microsoft-Environmental-Sustainability-Report-PDF.pdf` | `compliance` | `c524649c-6cd3-477a-9966-8cba40a00ed2` | `supersession` | `"133 million cubic meters of replenishment volume over their lifetime"` |
| `eval_07` | `Microsoft_Press_eBook_TheSecurityDevelopmentLifecycle_PDF.pdf` | `business_operations` | `0eb4d64f-a4cc-405f-95e5-93d4d85d3d7b` | `standard` | `"michael howard and steve lipner foreword by jim allchin"` |
| `eval_08` | *Out of domain (Pizza recipe)* | `null` | `null` | `no_answer_expected` | `null` (Refusal expected) |
| `eval_09` | *Out of domain (Jupiter moon Europa)* | `null` | `null` | `no_answer_expected` | `null` (Refusal expected) |

---

## 2. Explicit Flag (a): Duplicate Filename Pair Finding

During MongoDB and Pinecone inspection, two document records with identical filenames were identified:

1. **Record A**: `documentId: "192d9039-a59c-4298-9ed0-450c870b6666"`, `filename: "supplier-code-of-conduct-help-tool.pdf"`, `category: "finance"`
2. **Record B**: `documentId: "962b67e9-e2f7-4a7a-8ca3-c365e278191f"`, `filename: "supplier-code-of-conduct-help-tool.pdf"`, `category: "compliance"`

### Inspection Results
- A chunk-by-chunk content comparison confirmed that **Record A and Record B contain 100% identical text content**.
- **Action Taken**: Entry `eval_04` in `gold_set.json` maps to active document `962b67e9-e2f7-4a7a-8ca3-c365e278191f`.
- **Review Recommendation**: Record `192d9039-a59c-4298-9ed0-450c870b6666` (under category `finance`) is flagged as a true duplicate for manual cleanup if desired.

---

## 3. Explicit Flag (b): Supersession Test Execution & Verification

### Document Selected
`2026-Microsoft-Environmental-Sustainability-Report-PDF.pdf` (Original active `documentId`: `e9ee4bb1-b9ff-48f9-93dc-a96c1859f21d`, Category: `compliance`).

### Programmatic Re-Upload Execution
- A test revision buffer containing `[TEST REVISION - Phase 4 Supersession Test]` was passed through `DocumentService.prepareDocumentUpload()` and `DocumentService.saveDocumentMetadata()`.

### MongoDB Verification Results
- **Old Document (`e9ee4bb1-b9ff-48f9-93dc-a96c1859f21d`)**: Flipped to `status: "superseded"`.
- **New Document (`c524649c-6cd3-477a-9966-8cba40a00ed2`)**: Created with `status: "active"`, `version: 2`, and `supersedes: "e9ee4bb1-b9ff-48f9-93dc-a96c1859f21d"`.
- **Gold Set Mapping**: Entry `eval_06` (`test_type: "supersession"`) has `expected_documentId` set to the NEW document's ID `c524649c-6cd3-477a-9966-8cba40a00ed2`.

---

## 4. Explicit Flag (c): Content Support & Query Grounding Notes

- **Resume Document (`eval_01`)**: `Akshay Surana Job Resume.pdf` is an individual resume rather than an enterprise policy document. The query was grounded specifically in tax compliance skills extracted from the resume.
- **E-Book Document (`eval_07`)**: `Microsoft_Press_eBook_TheSecurityDevelopmentLifecycle_PDF.pdf` is a 168-chunk e-book. The query was grounded in the front-matter metadata chunk containing author names and foreword credits.
- All non-null queries have 100% verbatim text matches verified directly against stored Pinecone chunk contents.
